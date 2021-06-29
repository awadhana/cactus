import "jest-extended";
import test, { Test } from "tape";

import { Bools } from "../../../main/typescript/public-api";

test("Bools", (tParent: Test) => {
  test("Checks#isBooleanStrict()", (t: Test) => {
    expect(Bools.isBooleanStrict(true)).toBe(true);
    expect(Bools.isBooleanStrict(false)).toBe(true);

    expect(Bools.isBooleanStrict(0)).not.toBe(true);
    expect(Bools.isBooleanStrict(null)).not.toBe(true);
    expect(Bools.isBooleanStrict(undefined)).not.toBe(true);
    expect(Bools.isBooleanStrict([])).not.toBe(true);
    expect(Bools.isBooleanStrict({})).not.toBe(true);
    expect(Bools.isBooleanStrict(+0)).not.toBe(true);
    expect(Bools.isBooleanStrict(-0)).not.toBe(true);
    t.end();
  });

  test("isBooleanStrict()", async (t: Test) => {
    expect(Bools.isBooleanStrict(true)).toBe(true);
    expect(Bools.isBooleanStrict(false)).toBe(true);

    expect(Bools.isBooleanStrict(0));
    expect(Bools.isBooleanStrict({}));
    expect(Bools.isBooleanStrict([]));
    expect(Bools.isBooleanStrict(null));
    expect(Bools.isBooleanStrict(undefined));
    expect(Bools.isBooleanStrict(-0));
    expect(Bools.isBooleanStrict(+0));
    expect(Bools.isBooleanStrict(new Date()));
    expect(Bools.isBooleanStrict(""));
    expect(Bools.isBooleanStrict(String("")));
    expect(Bools.isBooleanStrict(Number("")));
    expect(Bools.isBooleanStrict(Number(0)));
    expect(Bools.isBooleanStrict(Infinity));
    expect(Bools.isBooleanStrict(NaN));
    t.end();
  });
  tParent.end();
});
