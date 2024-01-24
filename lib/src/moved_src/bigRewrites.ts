import { shallowCopy, scale, weightedSum, dot, norm2 } from "./blas1";
import { Point2d } from "./types";

type BisectParams = {
  maxiterations: number;
  tolerance: number;
};

// const pointDelta = (a:Point2d, b:Point2d)=>{
//   return 
// }

/** finds the zeros of a function, given two starting points (which must
 * have opposite signs */

export function bisect2d(
  f: (point: Point2d) => number,
  a: Point2d,
  b: Point2d,
  parameters: BisectParams
) {
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
    const mid = a + delta;
    const fmid = f(mid);

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
  arguments: number[];
  fx: number;
  fxprime: number[];

  alpha?: number;
};

export function conjugateGradient(f, initial, maxIterations?: number) {
  let current: ConjugateGradientPoint = {
    arguments: shallowCopy(initial),
    fx: 0,
    fxprime: shallowCopy(initial),
  };

  let next: ConjugateGradientPoint = {
    arguments: shallowCopy(initial),
    fx: 0,
    fxprime: shallowCopy(initial),
  };

  const yk = shallowCopy(initial);

  let temp: ConjugateGradientPoint = {
    arguments: [],
    fx: 0,
    fxprime: [],
  };

  let a = 1;

  const maxIter = maxIterations ?? initial.length * 20;

  current.fx = f(current.arguments, current.fxprime);
  const pk = shallowCopy(current.fxprime);
  scale(pk, current.fxprime, -1);

  const history: ConjugateGradientPoint[] = new Array(maxIter);
  history.map((_point) => {
    a = wolfeLineSearch(f, pk, current, next, a);

    if (!a) {
      // faiiled to find point that satifies wolfe conditions.
      // reset direction for next iteration
      scale(pk, current.fxprime, -1);
    } else {
      // update direction using Polak-Ribiere CG method
      weightedSum(yk, 1, next.fxprime, -1, current.fxprime);

      const delta_k = dot(current.fxprime, current.fxprime);
      const beta_k = Math.max(0, dot(yk, next.fxprime) / delta_k);

      weightedSum(pk, beta_k, pk, -1, next.fxprime);

      temp = current;
      current = next;
      next = temp;
    }

    if (norm2(current.fxprime) <= 0.00001) {
      break;
    }

    return {
      x: shallowCopy(current.arguments),
      fx: current.fx,
      fxprime: shallowCopy(current.fxprime),
      alpha: a,
    };
  });

  return current;
}

/// searches along line 'pk' for a point that satifies the wolfe conditions
/// See 'Numerical Optimization' by Nocedal and Wright p59-60
/// f : objective function
/// pk : search direction
/// current: object containing current gradient/loss
/// next: output: contains next gradient/loss
/// returns a: step size taken
function wolfeLineSearch(
  f: (a: number[][]) => number,
  pk,
  current: ConjugateGradientPoint,
  next: ConjugateGradientPoint,
  optimal_step_size: number,
  c1: number = 0.000001,
  c2: number = 0.1
): number {
  const phi0 = current.fx;
  const phiPrime0 = dot(current.fxprime, pk);
  let phi = phi0;
  let phi_old = phi0;
  let phiPrime = phiPrime0;
  let a0 = 0;

  optimal_step_size = optimal_step_size || 1;

  function zoom(a_lo: number, a_high: number, phi_lo: number) {
    for (let iteration = 0; iteration < 16; ++iteration) {
      optimal_step_size = (a_lo + a_high) / 2;
      weightedSum(next.arguments, 1, current.arguments, optimal_step_size, pk);
      phi = next.fx = f(next.arguments, next.fxprime);
      phiPrime = dot(next.fxprime, pk);

      if (phi > phi0 + c1 * optimal_step_size * phiPrime0 || phi >= phi_lo) {
        a_high = optimal_step_size;
      } else {
        const done = Math.abs(phiPrime) <= -c2 * phiPrime0;
        if (done) return optimal_step_size;

        // preare next step
        if (phiPrime * (a_high - a_lo) >= 0) {
          a_high = a_lo;
        }

        a_lo = optimal_step_size;
        phi_lo = phi;
      }
    }

    return 0;
  }

  // outer search loop
  for (let iteration = 0; iteration < 10; ++iteration) {
    weightedSum(next.arguments, 1, current.arguments, optimal_step_size, pk);
    phi = next.fx = f(next.arguments, next.fxprime);
    phiPrime = dot(next.fxprime, pk);
    if (
      phi > phi0 + c1 * optimal_step_size * phiPrime0 ||
      (iteration && phi >= phi_old)
    ) {
      return zoom(a0, optimal_step_size, phi_old);
    }

    const done = Math.abs(phiPrime) <= -c2 * phiPrime0;
    if (done) return optimal_step_size;

    if (phiPrime >= 0) return zoom(optimal_step_size, a0, phi);

    phi_old = phi;
    a0 = optimal_step_size;
    optimal_step_size *= 2;
  }

  return optimal_step_size;
}
