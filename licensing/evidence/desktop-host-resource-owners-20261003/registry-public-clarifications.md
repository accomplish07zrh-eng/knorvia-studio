The registry author asked two public-order questions before writing. Curator checked only the frozen selected baseline and answered:

1. connect registers ownership/key/logical/request first, awaits transport readiness race, and only after transport succeeds calls workspace preparation synchronously as the argument of its second race. No workspace preparation starts before transport readiness.
2. Registry dispose has no early return based solely on the disposed flag: only a saved disposal Promise short-circuits. If that Promise remains unassigned, another dispose re-enters cancellation and collection even though the flag is true; earlier invocation may already have cleared maps. Both entry disposal and registry disposal are async, so synchronous invocation failures become rejected returned Promises carrying the same reason. The entry memo assignment can remain absent while registry Promise.all consumes an entry's rejected Promise.

Author disclosed one collaboration status lookup exposing other authors' final metadata (paths, hashes, export/read reports), with no implementation bodies. This is a declared boundary exception; it does not establish independent OS isolation.

3. cancelConnect and idle-timer detached transport disposal use void invocation with no swallowed catch. Detached workspace release alone has explicit rejection suppression.
