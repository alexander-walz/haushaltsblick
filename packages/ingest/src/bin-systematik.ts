import { mainSystematik } from './cli-systematik';

mainSystematik(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
