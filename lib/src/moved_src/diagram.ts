import { select, selectAll } from "d3-selection";

import { intersectionArea, distance, getCenter } from "./circleintersection";
import { Circle, Point2d, Stats } from "./types";
import { nelderMead2d } from "./nelderMead";

// sometimes text doesn't fit inside the circle, if thats the case lets wrap
// the text here such that it fits
// todo: looks like this might be merged into d3 (
// https://github.com/mbostock/d3/issues/1642),
// also worth checking out is
// http://engineering.findthebest.com/wrapping-axis-labels-in-d3-js/
// this seems to be one of those things that should be easy but isn't
export function wrapText(circles: Circle[], labeller) {
  return function () {
    const text = select(this),
      data = text.datum(),
      width = circles[data.sets[0]].radius || 50,
      label = labeller(data) || "";

    const words = label.split(/\s+/).reverse();
    const maxLines = 3;
    const minChars = (label.length + words.length) / maxLines;
    let word = words.pop();
    const line = [word];
    let joined;
    const lineNumber = 0;
    const lineHeight = 1.1; // ems
    tspan = text.text(null).append("tspan").text(word);

    while (true) {
      word = words.pop();
      if (!word) break;
      line.push(word);
      joined = line.join(" ");
      tspan.text(joined);
      if (
        joined.length > minChars &&
        tspan.node().getComputedTextLength() > width
      ) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan").text(word);
        lineNumber++;
      }
    }

    const initial = 0.35 - (lineNumber * lineHeight) / 2,
      x = text.attr("x"),
      y = text.attr("y");

    text
      .selectAll("tspan")
      .attr("x", x)
      .attr("y", y)
      .attr("dy", function (d, i) {
        return initial + i * lineHeight + "em";
      });
  };
}

function circleMargin(current, interior, exterior) {
  let margin = interior[0].radius - distance(interior[0], current);
  let i;
  let m;
  for (i = 1; i < interior.length; ++i) {
    m = interior[i].radius - distance(interior[i], current);
    if (m <= margin) {
      margin = m;
    }
  }

  for (i = 0; i < exterior.length; ++i) {
    m = distance(exterior[i], current) - exterior[i].radius;
    if (m <= margin) {
      margin = m;
    }
  }
  return margin;
}

// compute the center of some circles by maximizing the margin of
// the center point relative to the circles (interior) after subtracting
// nearby circles (exterior)
export function computeTextCentre(interior, exterior) {
  // get an initial estimate by sampling around the interior circles
  // and taking the point with the biggest margin
  let points = [],
    i;
  for (i = 0; i < interior.length; ++i) {
    const c = interior[i];
    points.push({ x: c.x, y: c.y });
    points.push({ x: c.x + c.radius / 2, y: c.y });
    points.push({ x: c.x - c.radius / 2, y: c.y });
    points.push({ x: c.x, y: c.y + c.radius / 2 });
    points.push({ x: c.x, y: c.y - c.radius / 2 });
  }
  let initial = points[0];
  let margin = circleMargin(points[0], interior, exterior);

  for (i = 1; i < points.length; ++i) {
    const m = circleMargin(points[i], interior, exterior);
    if (m >= margin) {
      initial = points[i];
      margin = m;
    }
  }

  // maximize the margin numerically
  const solution = nelderMead2d(
    (p) => -1 * circleMargin({ x: p[0], y: p[1] }, interior, exterior),
    [initial.x, initial.y],
    { maxIterations: 500, minErrorDelta: 1e-10 }
  ).x;

  let ret: Point2d = { x: solution[0], y: solution[1] };

  // check solution, fallback as needed (happens if fully overlapped
  // etc)
  const valid: boolean =
    interior.every((item) => distance(ret, i) > item.radius) &&
    exterior.every((item) => distance(ret, item) < item.radius);

  if (!valid) {
    if (interior.length == 1) {
      ret = { x: interior[0].x, y: interior[0].y };
    } else {
      const areaStats: Stats = {
        area: 0,
        arcArea: 0,
        polygonArea: 0,
        arcs: [],
        innerPoints: [],
        intersectionPoints: [],
      };
      intersectionArea(interior, areaStats);

      if (areaStats.arcs.length === 0) {
        ret = { x: 0, y: -1000, disjoint: true };
      } else if (areaStats.arcs.length == 1) {
        ret = { x: areaStats.arcs[0].circle.x, y: areaStats.arcs[0].circle.y };
      } else if (exterior.length) {
        // try again without other circles
        ret = computeTextCentre(interior, []);
      } else {
        // take average of all the points in the intersection
        // polygon. this should basically never happen
        // and has some issues:
        // https://github.com/benfred/venn.js/issues/48#issuecomment-146069777
        ret = getCenter(areaStats.arcs.map((a) => a.p1));
      }
    }
  }

  return ret;
}

// given a dictionary of {setid : circle}, returns
// a dictionary of setid to list of circles that completely overlap it
function getOverlappingCircles(
  circles: Record<string, Circle>
): Record<string, string[]> {
  const ret: Record<string, string[]> = {};
  const circleids = [];
  for (const circleid in circles) {
    circleids.push(circleid);
    ret[circleid] = [];
  }

  for (let i = 0; i < circleids.length; i++) {
    const a = circles[circleids[i]];
    for (let j = i + 1; j < circleids.length; ++j) {
      const b = circles[circleids[j]];
      const d = distance(a, b);

      if (d + b.radius <= a.radius + 1e-10) {
        ret[circleids[j]].push(circleids[i]);
      } else if (d + a.radius <= b.radius + 1e-10) {
        ret[circleids[i]].push(circleids[j]);
      }
    }
  }
  return ret;
}

export function computeTextCentres(circles, areas) {
  const ret = {};
  const overlapped = getOverlappingCircles(circles);
  for (let i = 0; i < areas.length; ++i) {
    const area = areas[i].sets,
      areaids = {},
      exclude = {};
    for (let j = 0; j < area.length; ++j) {
      areaids[area[j]] = true;
      const overlaps = overlapped[area[j]];
      // keep track of any circles that overlap this area,
      // and don't consider for purposes of computing the text
      // centre
      for (let k = 0; k < overlaps.length; ++k) {
        exclude[overlaps[k]] = true;
      }
    }

    const interior = [],
      exterior = [];
    for (const setid in circles) {
      if (setid in areaids) {
        interior.push(circles[setid]);
      } else if (!(setid in exclude)) {
        exterior.push(circles[setid]);
      }
    }
    const centre = computeTextCentre(interior, exterior);
    ret[area] = centre;
    if (centre.disjoint && areas[i].size > 0) {
      console.log("WARNING: area " + area + " not represented on screen");
    }
  }
  return ret;
}

// sorts all areas in the venn diagram, so that
// a particular area is on top (relativeTo) - and
// all other areas are so that the smallest areas are on top
export function sortAreas(div, relativeTo) {
  // figure out sets that are completly overlapped by relativeTo
  const overlaps = getOverlappingCircles(div.selectAll("svg").datum());
  const exclude = {};
  for (let i = 0; i < relativeTo.sets.length; ++i) {
    const check = relativeTo.sets[i];
    for (const setid in overlaps) {
      const overlap = overlaps[setid];
      for (let j = 0; j < overlap.length; ++j) {
        if (overlap[j] == check) {
          exclude[setid] = true;
          break;
        }
      }
    }
  }

  // checks that all sets are in exclude;
  function shouldExclude(sets) {
    return sets.all(s=> s in exclude)
  }

  // need to sort div's so that Z order is correct
  div.selectAll("g").sort(newFunction(relativeTo, shouldExclude));
}

function newFunction(
  relativeTo: any,
  shouldExclude: (sets: any) => boolean
): any {
  return (a, b) => {
    // highest order set intersections first
    if (a.sets.length != b.sets.length) {
      return a.sets.length - b.sets.length;
    }

    if (a == relativeTo) {
      return shouldExclude(b.sets) ? -1 : 1;
    }
    if (b == relativeTo) {
      return shouldExclude(a.sets) ? 1 : -1;
    }

    // finally by size
    return b.size - a.size;
  };
}

export function circlePath({ x, y, radius }: Circle) {
  const ret = [];
  ret.push("\nM", x, y);
  ret.push("\nm", -radius, 0);
  ret.push("\na", radius, radius, 0, 1, 0, radius * 2, 0);
  ret.push("\na", radius, radius, 0, 1, 0, -radius * 2, 0);
  return ret.join(" ");
}

// inverse of the circlePath function, returns a circle object from an svg path
export function circleFromPath(path: string): Circle {
  const tokens = path.split(" ");
  return {
    x: parseFloat(tokens[1]),
    y: parseFloat(tokens[2]),
    radius: -parseFloat(tokens[4]),
  };
}

/** returns a svg path of the intersection area of a bunch of circles */
export function intersectionAreaPath(circles: Circle[]) {
  const stats = {};
  intersectionArea(circles, stats);
  const arcs = stats.arcs;

  if (arcs.length === 0) return "M 0 0";

  if (arcs.length == 1) return circlePath(arcs[0].circle);

  // draw path around arcs
  const ret = ["\nM", arcs[0].p2.x, arcs[0].p2.y];
  for (let i = 0; i < arcs.length; ++i) {
    const arc = arcs[i],
      r = arc.circle.radius,
      wide = arc.width > r;
    ret.push("\nA", r, r, 0, wide ? 1 : 0, 1, arc.p1.x, arc.p1.y);
  }
  return ret.join(" ");
}
