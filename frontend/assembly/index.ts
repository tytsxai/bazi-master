/**
 * Bazi Core Calculations in WebAssembly
 */

/**
 * Calculates the Heavenly Stem of a year.
 * Returns a number from 1 (Jia) to 10 (Gui).
 */
export function getYearStem(year: i32): i32 {
  let stem = (year - 3) % 10;
  if (stem <= 0) stem += 10;
  return stem;
}

/**
 * Calculates the Earthly Branch of a year.
 * Returns a number from 1 (Zi) to 12 (Hai).
 */
export function getYearBranch(year: i32): i32 {
  let branch = (year - 3) % 12;
  if (branch <= 0) branch += 12;
  return branch;
}

export function add(a: i32, b: i32): i32 {
  return a + b;
}
