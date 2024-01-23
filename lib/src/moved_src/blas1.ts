// https://github.com/benfred/fmin/blob/master/src/blas1.js
// need some basic operations on vectors, rather than adding a dependency,
// just define here

import { shallowCopy } from "./blas1";

export function zeros(x: number) {
  return new Array(x).fill(0);
}

export function zerosMatrix(x: number, y: number) {
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

type BisectParams = {
  maxiterations: number;
  tolerance: number;
};

/** finds the zeros of a function, given two starting points (which must
 * have opposite signs */
export function bisect(f, a, b, parameters: BisectParams) {
  // params
  parameters = parameters || {};
  const maxiterations = parameters.maxiterations || 100;
  const tolerance = parameters.tolerance || 1e-10;

  const fa = f(a);
  const fb = f(b);
  let delta = b - a;

  if (fa * fb > 0) {
    throw "initial bisect points must have opposite signs";
  }

  if (fa === 0) return a;
  if (fb === 0) return b;

  for (let i = 0; i < maxiterations; ++i) {
    delta /= 2;
    const mid = a + delta,
      fmid = f(mid);

    if (fmid * fa >= 0) {
      a = mid;
    }

    if (Math.abs(delta) < tolerance || fmid === 0) {
      return mid;
    }
  }
  return a + delta;
}

type ConjugateGradientPoint = {
  x: number[];
  fx: number;
  fxprime: number[];
};

export function conjugateGradient(f, initial, params) {
  let current: ConjugateGradientPoint = {
    x: shallowCopy(initial),
    fx: 0,
    fxprime: shallowCopy(initial),
  };

  const next: ConjugateGradientPoint = {
    x: shallowCopy(initial),
    fx: 0,
    fxprime: shallowCopy(initial),
  };

  const yk = shallowCopy(initial);
  const temp;
  const a = 1;

  params = params || {};
  let maxIterations = params.maxIterations || initial.length * 20;

  current.fx = f(current.x, current.fxprime);
  const pk = shallowCopy(current.fxprime);
  scale(pk, current.fxprime, -1);

  for (let i = 0; i < maxIterations; ++i) {
    a = wolfeLineSearch(f, pk, current, next, a);

    // todo: history in wrong spot?
    if (params.history) {
      params.history.push({
        x: current.x.slice(),
        fx: current.fx,
        fxprime: current.fxprime.slice(),
        alpha: a,
      });
    }

    if (!a) {
      // faiiled to find point that satifies wolfe conditions.
      // reset direction for next iteration
      scale(pk, current.fxprime, -1);
    } else {
      // update direction using Polak-Ribiere CG method
      weightedSum(yk, 1, next.fxprime, -1, current.fxprime);

      const delta_k = dot(current.fxprime, current.fxprime),
        beta_k = Math.max(0, dot(yk, next.fxprime) / delta_k);

      weightedSum(pk, beta_k, pk, -1, next.fxprime);

      temp = current;
      current = next;
      next = temp;
    }

    if (norm2(current.fxprime) <= 1e-5) {
      break;
    }
  }

  if (params.history) {
    params.history.push({
      x: current.x.slice(),
      fx: current.fx,
      fxprime: current.fxprime.slice(),
      alpha: a,
    });
  }

  return current;
}

/// searches along line 'pk' for a point that satifies the wolfe conditions
/// See 'Numerical Optimization' by Nocedal and Wright p59-60
/// f : objective function
/// pk : search direction
/// current: object containing current gradient/loss
/// next: output: contains next gradient/loss
/// returns a: step size taken
function wolfeLineSearch(f, pk, current, next, a, c1, c2) {
  const phi0 = current.fx;
  const phiPrime0 = dot(current.fxprime, pk);
  let phi = phi0;
  let phi_old = phi0;
  let phiPrime = phiPrime0;
  let a0 = 0;

  a = a || 1;
  c1 = c1 || 1e-6;
  c2 = c2 || 0.1;

  function zoom(a_lo, a_high, phi_lo) {
    for (let iteration = 0; iteration < 16; ++iteration) {
      a = (a_lo + a_high) / 2;
      weightedSum(next.x, 1.0, current.x, a, pk);
      phi = next.fx = f(next.x, next.fxprime);
      phiPrime = dot(next.fxprime, pk);

      if (phi > phi0 + c1 * a * phiPrime0 || phi >= phi_lo) {
        a_high = a;
      } else {
        if (Math.abs(phiPrime) <= -c2 * phiPrime0) {
          return a;
        }

        // preare next step
        if (phiPrime * (a_high - a_lo) >= 0) {
          a_high = a_lo;
        }

        a_lo = a;
        phi_lo = phi;
      }
    }

    return 0;
  }

  for (let iteration = 0; iteration < 10; ++iteration) {
    weightedSum(next.x, 1.0, current.x, a, pk);
    phi = next.fx = f(next.x, next.fxprime);
    phiPrime = dot(next.fxprime, pk);
    if (phi > phi0 + c1 * a * phiPrime0 || (iteration && phi >= phi_old)) {
      return zoom(a0, a, phi_old);
    }

    if (Math.abs(phiPrime) <= -c2 * phiPrime0) {
      return a;
    }

    if (phiPrime >= 0) {
      return zoom(a, a0, phi);
    }

    phi_old = phi;
    a0 = a;
    a *= 2;
  }

  return a;
}export function shallowCopy<T>(arr: Array<T>): Array<T> {
  return arr.slice();
}

