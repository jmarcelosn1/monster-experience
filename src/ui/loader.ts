// Contador pequeno, com porcentagem real (bytes baixados). Só aparece se a
// carga passar de `delay` ms e ainda faltar baixar; antes disso a abertura
// ocupa a tela sozinha, e com tudo baixado não há o que contar.

export function createLoader(el: HTMLElement, value: HTMLElement, delay = 400) {
  let complete = false;
  const timer = window.setTimeout(() => {
    if (!complete) el.classList.add('is-visible');
  }, delay);

  return {
    update(progress: number) {
      value.textContent = String(Math.round(Math.min(1, progress) * 100));
      complete = progress >= 1;
      if (complete) el.classList.remove('is-visible');
    },
    done() {
      window.clearTimeout(timer);
      value.textContent = '100';
      el.classList.remove('is-visible');
    },
  };
}

/** Baixa vários arquivos em paralelo e informa o progresso somado. */
export async function fetchAll(urls: string[], onProgress: (p: number) => void): Promise<Blob[]> {
  const loaded = urls.map(() => 0);
  const totals = urls.map(() => 0);
  const report = () => {
    if (totals.some((t) => t === 0)) return;
    onProgress(loaded.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0));
  };

  return Promise.all(
    urls.map(async (url, i) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      totals[i] = Number(res.headers.get('content-length')) || 0;
      if (!res.body || totals[i] === 0) {
        const blob = await res.blob();
        loaded[i] = totals[i] = Math.max(1, blob.size);
        report();
        return blob;
      }
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as BlobPart);
        loaded[i] += value.byteLength;
        report();
      }
      return new Blob(chunks, { type });
    }),
  );
}
