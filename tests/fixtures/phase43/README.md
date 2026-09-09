# Phase 43 deterministic regression inputs

These fixtures and their existing `canonical.expected.json` and
`validation.expected.json` are evaluated against mobile framework commit
`57e60c58b28ad4981e9a0b20ec50563c36ff854c`, also pinned by the Recorder quality CI
workflow. `phase43DeterministicRegression.test.js` explicitly archives this commit
into a temporary workspace. It neither checks out nor modifies the QA framework.

The framework revision is part of the test input: later `main` commits can add
locators and Steps that correctly collide with an older proposed case. Testing
that different catalog against these original expected results would conflate
framework drift with a deterministic-generation regression.

The test keeps every existing canonical-content and validation assertion. It does
not relax collision detection or rewrite approved expectations. Missing source
commit objects fail explicitly; the helper never substitutes `HEAD` for this pin.
Other tests retain the default current committed framework unless they explicitly
supply their own revision. A future baseline update must review the complete input
and expected output as a separate change.
