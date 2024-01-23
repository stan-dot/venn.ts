import { shallowCopy, weightedSum } from "./blas1";

type NelderMead2dParameters = {
  nonZeroDelta: number;
  zeroDelta: number;
  minErrorDelta: number;
  minTolerance: number;
  rho: number;
  chi: number;
  psi: number;
  sigma: number;
};

const defaultParameters: NelderMead2dParameters = {
  nonZeroDelta: 1.05,
  zeroDelta: 0.001,
  minErrorDelta: 1e-6,
  minTolerance: 1e-5,
  rho: 1,
  chi: 2,
  psi: -0.5,
  sigma: 0.5,
};

type IterationResult = {
  index_at_peak: number[];
  value_at_peak: number;
  simplex: Simplex2d;
};

type SomeFunction = (someArguments: number[]) => number;

interface SimplexPoint2d {
  fx: number; // The function value at this point
  id: number; // An identifier for the point
  // The coordinates of the point, represented as an array of numbers
  coordinates: {
    x:number, y: number
  };
  // [index: number]: number | undefined; // Using an index signature for numeric properties
}

type Simplex2d = SimplexPoint2d[];

export type Solution = {
  value_at_peak: number;
  index_at_peak: SimplexPoint2d;
};

/** minimizes a function using the downhill simplex method */
export function nelderMead2d(
  f: SomeFunction,
  initialGuess: Simplex2d,
  parameters: NelderMead2dParameters
): Solution {
  const {
    nonZeroDelta,
    zeroDelta,
    minErrorDelta,
    minTolerance,
    rho,
    chi,
    psi,
    sigma,
  } = { ...parameters, ...defaultParameters };
  const maxIterations = initialGuess.length * 200;
  let maxDiff = 0;

  // initialize simplex.
  const N = initialGuess.length;
  const simplex = new Array(N + 1);

  simplex[0] = initialGuess;
  simplex[0].fx = f(initialGuess);
  simplex[0].id = 0;

  for (let i = 0; i < N; ++i) {
    const point = shallowCopy(initialGuess);
    point[i] = point[i] ? point[i] * nonZeroDelta : zeroDelta;
    simplex[i + 1].coordinates = point;
    simplex[i + 1].fx = f(point);
    simplex[i + 1].id = i + 1;
  }

  function updateSimplex(value: SimplexPoint2d) {
    for (let i = 0; i < value.length; i++) {
      simplex[N][i] = value[i];
    }
    simplex[N].fx = value.fx;
  }

  const sortOrder = (a, b) => a.fx - b.fx;

  const history: any[] = [];
  const centroid = shallowCopy(initialGuess);
  const reflected = shallowCopy(initialGuess);
  const contracted = shallowCopy(initialGuess);
  const expanded = shallowCopy(initialGuess);

  for (let iteration = 0; iteration < maxIterations; ++iteration) {
    simplex.sort(sortOrder);

    // copy the simplex (since later iterations will mutate) and
    // sort it to have a consistent order between iterations
    const sortedSimplex = simplex.map((x) => {
      let state = x.slice();
      state = { ...state, fx: x.fx, id: x.id };
      return state;
    });
    sortedSimplex.sort((a, b) => a.id - b.id);

    history.push({
      x: simplex[0].slice(),
      fx: simplex[0].fx,
      simplex: sortedSimplex,
    });

    maxDiff = 0;
    for (let i = 0; i < N; ++i) {
      maxDiff = Math.max(maxDiff, Math.abs(simplex[0][i] - simplex[1][i]));
    }

    if (
      Math.abs(simplex[0].fx - simplex[N].fx) < minErrorDelta &&
      maxDiff < minTolerance
    ) {
      break;
    }

    // compute the centroid of all but the worst point in the simplex
    for (let i = 0; i < N; ++i) {
      centroid[i] = 0;
      for (let j = 0; j < N; ++j) {
        centroid[i] += simplex[j].coordinates[i];
      }
      centroid[i] /= N;
    }

    // reflect the worst point past the centroid  and compute loss at reflected
    // point
    const worst = simplex[N];
    weightedSum(reflected, 1 + rho, centroid, -rho, worst);
    reflected.fx = f(reflected);

    // if the reflected point is the best seen, then possibly expand
    if (reflected.fx < simplex[0].fx) {
      weightedSum(expanded, 1 + chi, centroid, -chi, worst);
      expanded.fx = f(expanded);
      if (expanded.fx < reflected.fx) {
        updateSimplex(expanded);
      } else {
        updateSimplex(reflected);
      }
    }

    // if the reflected point is worse than the second worst, we need to
    // contract
    else if (reflected.fx >= simplex[N - 1].fx) {
      let shouldReduce = false;

      if (reflected.fx > worst.fx) {
        // do an inside contraction
        weightedSum(contracted, 1 + psi, centroid, -psi, worst);
        contracted.fx = f(contracted);
        if (contracted.fx < worst.fx) {
          updateSimplex(contracted);
        } else {
          shouldReduce = true;
        }
      } else {
        // do an outside contraction
        weightedSum(contracted, 1 - psi * rho, centroid, psi * rho, worst);
        contracted.fx = f(contracted);
        if (contracted.fx < reflected.fx) {
          updateSimplex(contracted);
        } else {
          shouldReduce = true;
        }
      }

      if (shouldReduce) {
        // if we don't contract here, we're done
        if (sigma >= 1) break;

        // do a reduction
        for (i = 1; i < simplex.length; ++i) {
          weightedSum(simplex[i], 1 - sigma, simplex[0], sigma, simplex[i]);
          simplex[i].fx = f(simplex[i]);
        }
      }
    } else {
      updateSimplex(reflected);
    }
  }

  simplex.sort(sortOrder);
  return { value_at_peak: simplex[0].fx, index_at_peak: simplex[0] };
}
