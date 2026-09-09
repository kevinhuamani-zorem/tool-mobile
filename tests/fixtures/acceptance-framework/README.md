# Acceptance assertion fixture

Static evidence for `tests/acceptanceCriteria.test.js`, independent of the mobile
framework checked out by CI or a developer. This is a test fixture, not a QA golden
or an executable device test.

The four recognized Screen members and both dependency files come from mobile
commit `09674ce8ba298f650ad116c8d1dd82c7e19e8577`. They match the token hashes in
`core/validation/infrastructure/rules/dateRangeProfile.json`. The Screen keeps only
those members, the 30/90-day wrappers and a getter needed by the presence mutation;
its gesture-helper field is an unexecuted fixture declaration. The locator JSON
keeps only the date and presence keys. Dependency files remain complete because
the profile deliberately fingerprints their complete executable tokens.

Tests copy these files into a new temporary workspace before mutating them. They
must not copy files from `HEAD`, update the profile automatically or rewrite golden
expectations to hide drift. A new reviewed assertion profile requires an explicit
fixture revision and corresponding positive and negative tests.
