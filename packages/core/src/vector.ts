export class Vector {
  constructor(public x: number = 0, public y: number = 0) {}

  add(vector: Vector): Vector {
    this.x += vector.x;
    this.y += vector.y;
    return this;
  }

  subtract(vector: Vector): Vector {
    this.x -= vector.x;
    this.y -= vector.y;
    return this;
  }

  multiply(scalar: number): Vector {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  clone(): Vector {
    return new Vector(this.x, this.y);
  }

  set(x: number, y: number): Vector {
    this.x = x;
    this.y = y;
    return this;
  }

  static zero(): Vector {
    return new Vector(0, 0);
  }
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}
