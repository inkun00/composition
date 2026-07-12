export type Rational = Readonly<{ numerator: number; denominator: number }>;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

export function rational(numerator: number, denominator = 1): Rational {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error("박자는 정수 비율로 입력해야 합니다.");
  }
  if (denominator === 0) {
    throw new Error("분모는 0일 수 없습니다.");
  }
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: (sign * numerator) / divisor,
    denominator: Math.abs(denominator) / divisor
  };
}

export function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function compare(left: Rational, right: Rational): number {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

export function equals(left: Rational, right: Rational): boolean {
  return compare(left, right) === 0;
}

export function toNumber(value: Rational): number {
  return value.numerator / value.denominator;
}

export function sum(values: readonly Rational[]): Rational {
  return values.reduce(add, rational(0));
}
