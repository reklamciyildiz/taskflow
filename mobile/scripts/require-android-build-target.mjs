console.error(
  [
    "Refusing to build or sync Android without an explicit environment target.",
    "Use `npm run android:sync:staging` or `npm run android:debug:staging` for the local staging emulator build.",
    "A production target must be added separately with its own reviewed HTTPS configuration.",
  ].join("\n"),
);

process.exit(1);
