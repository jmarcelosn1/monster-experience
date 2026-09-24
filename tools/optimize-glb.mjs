// Prepara o GLB da lata para a web: tira as gotas com transmissão, separa o
// material do lacre, remove a textura embutida (os rótulos carregam à parte),
// reduz o corpo e comprime com Meshopt.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const SOURCE = 'sources/monster-ultra.glb';
const TARGET = 'public/models/can.glb';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(SOURCE);
const root = doc.getRoot();

const countTris = () =>
  root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0), 0);
console.log('triângulos na fonte:', countTris());

for (const node of root.listNodes()) {
  if (/droplet/i.test(node.getName())) {
    node.getMesh()?.dispose();
    node.dispose();
  }
}

const material = (name) => {
  const found = root.listMaterials().find((m) => m.getName() === name);
  if (!found) throw new Error(`material ausente: ${name}`);
  return found;
};

const label = material('Satin silver white printed label').setName('label');
label.setBaseColorTexture(null);
material('Brushed aluminium').setName('alu');
material('Recessed aluminium').setName('aluDark');
const rim = material('Pull tab aluminium').setName('rim');
const tab = rim.clone().setName('tab');

for (const node of root.listNodes()) {
  if (/pull tab|tab rolled/i.test(node.getName())) {
    for (const prim of node.getMesh().listPrimitives()) prim.setMaterial(tab);
  }
}

// Só o rótulo usa textura; sem UV nas outras peças, elas se juntam por material.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial() !== label) prim.setAttribute('TEXCOORD_0', null);
  }
}

await doc.transform(weld());

const body = root.listNodes().find((n) => /printed aluminium body/i.test(n.getName()));
for (const prim of body.getMesh().listPrimitives()) {
  simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.0004, lockBorder: true });
}

await doc.transform(
  prune({ keepAttributes: true }),
  dedup({ keepUniqueNames: true }),
  flatten(),
  join({ keepNamed: false }),
  prune({ keepAttributes: true }),
);

for (const ext of root.listExtensionsUsed()) {
  if (/transmission|volume|ior/.test(ext.extensionName)) ext.dispose();
}

await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

console.log('triângulos na saída:', countTris());
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    console.log(' ', prim.getMaterial()?.getName(), prim.getIndices().getCount() / 3, 'tri', Object.keys(Object.fromEntries(prim.listSemantics().map((s) => [s, 1]))).join(','));
  }
}

await io.write(TARGET, doc);
console.log('gravado em', TARGET);
