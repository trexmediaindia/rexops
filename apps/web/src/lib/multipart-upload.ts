export const MULTIPART_PART_SIZE = 10 * 1024 * 1024;

export function partNumbersForSize(size: number, partSize = MULTIPART_PART_SIZE) {
  return Array.from({ length: Math.ceil(size / partSize) }, (_, index) => index + 1);
}

export function partBounds(partNumber: number, size: number, partSize = MULTIPART_PART_SIZE) {
  const start = (partNumber - 1) * partSize;
  return { start, end: Math.min(start + partSize, size) };
}

export function batches<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

export async function concurrentMap<T, R>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function consume() {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index];
      if (value !== undefined) results[index] = await work(value);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => consume()));
  return results;
}
