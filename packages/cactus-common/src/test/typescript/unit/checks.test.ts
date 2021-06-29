import "jest-extended";
import test, { Test } from "tape-promise/tape";
import { v4 as uuidv4 } from "uuid";

import { Checks } from "../../../main/typescript";

test("Checks", () => {
  test("Checks#nonBlankString()", (t: Test) => {
    const subject = uuidv4();
    const pattern = new RegExp(`${subject}`);

    expect(() => Checks.nonBlankString("", subject)).toThrowWithMessage(
      TypeError,
      pattern,
    );
    expect(() => Checks.nonBlankString(" ", subject)).toThrowWithMessage(
      TypeError,
      pattern,
    );
    expect(() => Checks.nonBlankString("\n", subject)).toThrowWithMessage(
      TypeError,
      pattern,
    );
    expect(() => Checks.nonBlankString("\t", subject)).toThrowWithMessage(
      TypeError,
      pattern,
    );
    expect(() => Checks.nonBlankString("\t\n", subject)).toThrowWithMessage(
      TypeError,
      pattern,
    );
    expect(() => Checks.nonBlankString("\n\r", subject)).toThrowWithMessage(
      TypeError,
      pattern,
    );

    expect(() => Checks.nonBlankString("-")).not.toThrow();
    expect(() => Checks.nonBlankString(" a ")).not.toThrow();
    expect(() => Checks.nonBlankString("\na\t")).not.toThrow();
    t.end();
  });

  test("#truthy()", (t: Test) => {
    expect(() => Checks.truthy(false)).toThrow();
    expect(() => Checks.truthy(NaN)).toThrow();
    expect(() => Checks.truthy(null)).toThrow();
    expect(() => Checks.truthy(undefined)).toThrow();
    expect(() => Checks.truthy(0)).toThrow();
    expect(() => Checks.truthy("")).toThrow();

    expect(() => Checks.truthy({})).not.toThrow();
    expect(() => Checks.truthy([])).not.toThrow();
    expect(() => Checks.truthy("OK")).not.toThrow();
    t.end();
  });
});
