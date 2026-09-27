// What the command line asks for: audit a site, or rebuild a saved audit's
// Scorecard and report. Pure, so the `42` in `--audit 42` is provably never
// read as a URL.
export type Command =
  | { kind: "audit"; url: string }
  | { kind: "rebuild"; auditId: number }
  | { kind: "usage"; problem: string };

export function parseArguments(args: string[]): Command {
  const flag = args.indexOf("--audit");

  if (flag === -1) {
    // pnpm may pass a bare `--` through, so every `--` argument is skipped.
    const url = args.find((arg) => !arg.startsWith("--"));
    return url ? { kind: "audit", url } : { kind: "usage", problem: "no URL" };
  }

  const id = args[flag + 1];
  if (id === undefined || id.startsWith("--")) return { kind: "usage", problem: "--audit needs an audit id" };
  if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)))
    return { kind: "usage", problem: `${id} is not an audit id` };

  const others = args.filter((arg, index) => index !== flag + 1 && !arg.startsWith("--"));
  if (others.length > 0) return { kind: "usage", problem: "--audit takes no URL" };

  return { kind: "rebuild", auditId: Number(id) };
}
