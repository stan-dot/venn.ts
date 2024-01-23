// https://github.com/benfred/fmin/blob/master/src/blas1.js

export function zeros(x: number) {
  return new Array(x).fill(0);
}

export function zerosM(x: number, y: number) {
  return zeros(x).map(() => zeros(y));
}

export function dot(a: number[], b: number[]) {
  // must be the same size
  const sameSize = a.length === b.length;
  if (!sameSize) throw Error("must be the same size");
  const zipped = a.map((item, index) => {
    return { aValue: item, bValue: b[index] };
  });
  return zipped.reduce((p, c) => {
    return p + c.aValue * c.bValue;
  }, 0);
}

export function norm2(a: number[]) {
  return Math.sqrt(dot(a, a));
}

export function weightedSum(
  ret: number[],
  w1: number,
  v1: number[],
  w2: number,
  v2: number[]
) {
  return ret.map((_item, index) => w1 * v1[index] + w2 * v2[index]);
}

export function scale(ret, value, c) {
  for (let i = 0; i < value.length; ++i) {
    ret[i] = value[i] * c;
  }
}

export function shallowCopy<T>(arr: Array<T>): Array<T> {
  return arr.slice();
}
