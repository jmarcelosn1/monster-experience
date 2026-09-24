import * as THREE from 'three';

// Cache de texturas de imagem (rótulos, máscaras, fundos). Os arquivos chegam
// comprimidos e ficam guardados como Blob; decodificar e enviar à placa de
// vídeo só acontece para o que está em uso ou logo ao lado. O que passou do
// limite sai da GPU, menos o que estiver fixado (em uso na tela).

interface Entry {
  promise: Promise<THREE.Texture>;
  texture: THREE.Texture | null;
}

export function createTextures(renderer: THREE.WebGLRenderer, maxResident: number) {
  const blobs = new Map<string, Promise<Blob>>();
  const entries = new Map<string, Entry>();
  const recent: string[] = [];
  let pinned = new Set<string>();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  function prefetch(url: string) {
    let blob = blobs.get(url);
    if (!blob) {
      blob = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.blob();
      });
      blobs.set(url, blob);
    }
    return blob;
  }

  function seed(url: string, blob: Blob) {
    blobs.set(url, Promise.resolve(blob));
  }

  async function decode(url: string, srgb: boolean) {
    const blob = await prefetch(url);
    // createImageBitmap decodifica fora da thread principal
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false; // ImageBitmap ignora flipY; quem desenha compensa
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    renderer.initTexture(texture); // envia agora, não no meio de uma troca
    return texture;
  }

  function touch(url: string) {
    const i = recent.indexOf(url);
    if (i >= 0) recent.splice(i, 1);
    recent.push(url);
    while (recent.length > maxResident) {
      const victim = recent.find((u) => !pinned.has(u));
      if (!victim) break;
      recent.splice(recent.indexOf(victim), 1);
      const entry = entries.get(victim);
      entries.delete(victim);
      void entry?.promise.then((t) => {
        (t.image as ImageBitmap).close?.();
        t.dispose();
      });
    }
  }

  function load(url: string, srgb: boolean) {
    let entry = entries.get(url);
    if (!entry) {
      const created: Entry = { texture: null, promise: decode(url, srgb) };
      created.promise.then(
        (t) => void (created.texture = t),
        (err) => {
          entries.delete(url);
          console.error(err);
        },
      );
      entries.set(url, created);
      entry = created;
    }
    touch(url);
    return entry.promise;
  }

  /** A textura, se já estiver pronta; senão começa a carregar e devolve null. */
  function ready(url: string, srgb: boolean) {
    const entry = entries.get(url);
    if (!entry) {
      void load(url, srgb).catch(() => undefined);
      return null;
    }
    if (entry.texture) touch(url);
    return entry.texture;
  }

  /** Texturas que não podem sair da GPU agora. */
  function pin(urls: string[]) {
    pinned = new Set(urls);
  }

  return { prefetch, seed, load, ready, pin };
}

export type Textures = ReturnType<typeof createTextures>;
