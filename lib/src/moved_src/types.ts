
export type Point2d = {
  x: number;
  y: number;
};

export type Circle = {
  x: number;
  y: number;
  radius: number;
};

export type Stats = {
  area: number;
  arcArea: number;
  polygonArea: number;
  arcs: Arc[];
  innerPoints: Point2d[];
  intersectionPoints: Point2d[];
};

export type Arc = {
  circle: Circle;
  width: number;
  p1: Point2d;
  p2: Point2d;
};

