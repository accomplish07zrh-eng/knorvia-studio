# dynamic-workflow-01 替换验收

- 包：dynamic-workflow-01，重写目标 53 个继承文件（范围 55，其中 2 个 unreviewed 文件不动），另有 8 个新拆出的模块。
- 合同：v2。`node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-01 --tests '*.test.mjs' --dist-env KNORVIA_DW01_ENTRY=dist`：源码入口 39/39，dist 入口 39/39（golden 样例 324/324）。
- 合同 v2 的变化：按计划书「删除全部旧文件和桩」（第 416、466 行）删除了 `stubs/`。B20 原先以桩为 oracle，现按「M1 复盘」第 4 条（桩互锁 C 通道）和 core-tool-01 B88 先例，改为以 interface.md 的导出声明块为 oracle，断言方向不变（源码导出 ⊆ 合同声明，缺一即失败）。桩自身的检查（抛 not implemented、targets.txt 计数）随桩一并删除。其余 38 条用例没有改动，`gate-old.json` 保留不动。
- 相似度（只对比 ZCode@872ad960，门槛不变）：
  - 普通模式：60 个文件，60 个通过；
  - 声明模式：`compiler/compile-types.ts` 只含 5 个公共接口，用 `--declaration --interface specs/contracts/dynamic-workflow-01/interface.md` 计分（口径见 docs/knorvia-contracts-01-acceptance.md 第 26 行），1/1 通过。
- 全仓搜 `not implemented: dynamic-workflow-01` 结果为零。公共导出、协议字段、KNORVIA\_ 环境变量和数据目录都没有改动。

## 证据 re-pin 记录

照 #185（`runtime-turn-persistence-safety-20261003` 只改 `tool-part-persistence` 摘要值）和 helpers 验收 §12：只刷新本包重写文件的源码、产物、声明 sha，以及这些 JSON 自身哈希的随动字面量。断言、注释清单、语法摘要期望值、历史 `compiled` / `declaration` 正文都没有改。

| 文件 | 条目 | 旧 sha256 | 新 sha256 |
| --- | --- | --- | --- |
| `may-set-lane-expansion-current.json` | `sourceSha256 src/analysis/causality-graph-lanes.ts` | `98892ea6b13e93227677f1fe9c103e30e2fbf8dccd9dd95982d000140a12b1d7` | `61ce9ffb0cddff9e9bf741209a01cf32361c1eb130220553647648bafd4a3604` |
| `may-set-lane-expansion-current.json` | `emittedSha256 dist/analysis/causality-graph-lanes.js` | `35f6ef1114cc8ca76eb1dbdd75f5bd469f51faa7a7cf6962179962c63f40b691` | `05a7263033464719f1f81a937c808aa7628cdb9811f1f0c2d4fba2c8f80e6b32` |
| `may-set-lane-expansion-current.json` | `declarationSha256 dist/analysis/causality-graph-lanes.d.ts` | `dde82e79069d3d5c7f3fedc1d8fc2199dd327852259d755771b5870dd2a252b4` | `6bebe7f6b93992e31a3be9a8782ef8b37574dd223628902747aed6037b401100` |
| `causality-order-settlement-current.json` | `sourceSha256 src/analysis/causality-order-settle.ts` | `7db70a0dea97cc3855fe614c2d990e0171a972749b300e6dadeae250b275d1ae` | `eb04234838d21af47515fd34dc68960942ef5d1bd3782246c0dead04d5c77397` |
| `causality-order-settlement-current.json` | `emittedSha256 dist/analysis/causality-order-settle.js` | `4e29870b350241e08a102e945d190d312ae9fe34e09761e0d1ffefaf3ef28a7a` | `2d9e9d28564ee3f937a779c8b2ba7013c39efe4d214c46d3d6d85d6632801e48` |
| `causality-order-settlement-current.json` | `declarationSha256 dist/analysis/causality-order-settle.d.ts` | `31d6906b2f9f6b793aeb2904e4ebf7fc9c1207acc2f1361920ecaf488b69d876` | `9c957c8d17606d4e6fa06b7ae2898bd0c271bba0f48160466f916843c5b1ae0d` |
| `causality-reduction-baseline.json` | `consumers.phase-graph dist/analysis/phase-graph.js` | `4c479d9f779be160e464c08f2559149686233d399ecce42f9caed1aeea8caaa8` | `2d1fae3fa2ac4cb11a4419e1193df6504b57fa0fb1cb524ab5a8ee61c2d86e00` |
| `causality-reduction-baseline.json` | `consumers.causality-graph dist/analysis/causality-graph.js` | `502fa996699316f39c3b5313f0bdd24f4e558ef1f7b038a86a753b2cf9385743` | `c430676b83fc64a47a64a04dc88ede8b419018e937bae0c532fe3bb86f47b42d` |
| `causality-reduction-baseline.json` | `consumers.analyze dist/analysis/analyze.js` | `03b8fb8010c72dd18a2117f796cc82ed03ecaf8b351ad1eb4990ba59914c3961` | `1efca01c1c8afc32be887c892042b293d707410fe2d994decf90553e3f07320b` |
| `causality-order-settlement-baseline.json` | `consumers.causality-order-calls dist/analysis/causality-order-calls.js` | `41264eb7acaef4f51c405bebb8ec6789682d810e85a0e70cd78a8f4f0c9d6199` | `f4f69edb14788521cac9fad5bcb3a6552b812e0b8dc7b8c4eab5a05c733fd396` |
| `causality-order-settlement-baseline.json` | `consumers.causality-order-loops dist/analysis/causality-order-loops.js` | `659ff5a9f63144b16c8f4613440246538804c6b459bcaf926574df443905bf90` | `fcf91eb013f1dad599de2ae6fc096aa9511c42e7f811c8abffcddd6eb01fa95b` |
| `causality-order-settlement-baseline.json` | `consumers.causality-order-walk dist/analysis/causality-order-walk.js` | `b1666697f6b8de423a078efe261ae70db2af336c13b0ece1de5df9acdb7a2290` | `62e66fcdb601c32bee5d2eff4db6229077dccf92df3566c41c225d3977b6f36c` |
| `causality-order-settlement-baseline.json` | `consumers.causality-order dist/analysis/causality-order.js` | `cccfdec4ae2b1c1c960fcdd91a1b48e4e42c0fdb98c4e8611964169fc622ca60` | `28f48e69120bfc1687e16dad228a675773d9293e2143ab2388daec4e0e6d8e49` |
| `causality-order-settlement-baseline.json` | `consumers.interpret dist/analysis/interpret.js` | `a47bd1dd7b122e77c1c783f0356480b1409c916ef31a944d535692b9dacdd2f7` | `0ef568a05a1e6e2c4202154d85ae586e2f50490625eeae39c8d9f19ecd3dd988` |
| `causality-order-settlement-baseline.json` | `consumers.analyze dist/analysis/analyze.js` | `03b8fb8010c72dd18a2117f796cc82ed03ecaf8b351ad1eb4990ba59914c3961` | `1efca01c1c8afc32be887c892042b293d707410fe2d994decf90553e3f07320b` |
| `may-set-lane-expansion-baseline.json` | `consumers.causality-graph dist/analysis/causality-graph.js` | `502fa996699316f39c3b5313f0bdd24f4e558ef1f7b038a86a753b2cf9385743` | `c430676b83fc64a47a64a04dc88ede8b419018e937bae0c532fe3bb86f47b42d` |
| `may-set-lane-expansion-baseline.json` | `consumers.analyze dist/analysis/analyze.js` | `03b8fb8010c72dd18a2117f796cc82ed03ecaf8b351ad1eb4990ba59914c3961` | `1efca01c1c8afc32be887c892042b293d707410fe2d994decf90553e3f07320b` |
| `fanout-cardinality-baseline.json` | `consumers.interpret dist/analysis/interpret.js` | `a47bd1dd7b122e77c1c783f0356480b1409c916ef31a944d535692b9dacdd2f7` | `0ef568a05a1e6e2c4202154d85ae586e2f50490625eeae39c8d9f19ecd3dd988` |
| `fanout-cardinality-baseline.json` | `consumers.analyze dist/analysis/analyze.js` | `03b8fb8010c72dd18a2117f796cc82ed03ecaf8b351ad1eb4990ba59914c3961` | `1efca01c1c8afc32be887c892042b293d707410fe2d994decf90553e3f07320b` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/callbacks.ts` | `91cf3a7bc05b036342aa9508110f0fb9b44f8cbe64364027d9da21671a26ba61` | `f9cb4fc8dd5c5f322f871f7ecd78adaa16023014e530f1ce5f815ab68102a982` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/callbacks.js` | `68ead157f96a4fd88e876792b72e62f2c3b3349e3e65cf761668d8476b0f3465` | `8bbd05dad8a6d08bcd85821d78353adbff6c71fa3108b554a973733aaac89b4c` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order-functions.ts` | `76196deb7c5889b5125f19c47d5104955bf4b174b3221fb2b17fb2d3503fe14d` | `74b47a697928616de681da9bde86f2190616fd2aa730e153cd4a64f1a94c61aa` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order-functions.js` | `eb6c87ce6d37fd871d0ddd861387bef0dbdc47a621d353737703382cdeebffc1` | `6b4ec135229feccc7a21ceed37e51409e1f4714514ea98fe0d32399d336df9ce` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/sites.ts` | `6d15282ae4b5e4166fcade61c9adb45a0fa040ecd482b20d0b82357c12038322` | `beb2c99c5dd5e54a23fe09d2a948babbdbb89555208484d3995bfecb88f2fbbb` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/sites.js` | `d22ac8f5a9d9e6ecf108ba52159c9f649b743cf7f8d8150a30cd1d297d2bad34` | `2230a1dd364d132ebe5b37b9f2447550c4a18a5042165dd6c486621af0ebe992` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order-state.ts` | `7c7ec70dd3a372217ff136a327156dfdb7fd1ef3dcbe721fe3b2d361782b13b8` | `6d1b167697853a1a5f5f3c218d03d8391f53241b246fad60c7ebbf9c845778e3` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order-state.js` | `86b97719859af605cfb5d79a2a4139b80292323c0cf97b85bbb778d119986bdc` | `2389060d3e69581583dfdb7753a8e7ef79156142ba898552d6af60fea3481648` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order-settle.ts` | `7db70a0dea97cc3855fe614c2d990e0171a972749b300e6dadeae250b275d1ae` | `eb04234838d21af47515fd34dc68960942ef5d1bd3782246c0dead04d5c77397` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order-settle.js` | `4e29870b350241e08a102e945d190d312ae9fe34e09761e0d1ffefaf3ef28a7a` | `2d9e9d28564ee3f937a779c8b2ba7013c39efe4d214c46d3d6d85d6632801e48` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order-calls.ts` | `c153d1349a06fd08151e8980954e2f570c7c8c8888b1016fdea097065b052462` | `6346381bd5d7de168df27f545fd60ca7c5086c26a5b22aedaa0eafa6a205d6b0` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order-calls.js` | `41264eb7acaef4f51c405bebb8ec6789682d810e85a0e70cd78a8f4f0c9d6199` | `f4f69edb14788521cac9fad5bcb3a6552b812e0b8dc7b8c4eab5a05c733fd396` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order-loops.ts` | `ce80981d778eb5d2d3eb15c4349aab8770cb94081c4fc45bc462a41c26c7f76f` | `4356c58e48f175eb86d4081afa26c35e73a42f1fe6d70c76461a93920731ed6d` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order-loops.js` | `659ff5a9f63144b16c8f4613440246538804c6b459bcaf926574df443905bf90` | `fcf91eb013f1dad599de2ae6fc096aa9511c42e7f811c8abffcddd6eb01fa95b` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order-walk.ts` | `a63999b12058dc2fa97cce78417d0e7a798e62a84a000431bfbff8b3dadb8044` | `9fbe8498dd217d203b0fb0fc04ed76ab9a12d28dfc02afd74b2fbf8f05823d56` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order-walk.js` | `b1666697f6b8de423a078efe261ae70db2af336c13b0ece1de5df9acdb7a2290` | `62e66fcdb601c32bee5d2eff4db6229077dccf92df3566c41c225d3977b6f36c` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/causality-order.ts` | `20bf97bf46a9e8a26878c57f3a4f4e078458fa841c85f18f3be7218622d1001d` | `15cfe668a171a996aadd3b9213aac3c9a9557dd4d994265e3dea8a7922d1e03f` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/causality-order.js` | `cccfdec4ae2b1c1c960fcdd91a1b48e4e42c0fdb98c4e8611964169fc622ca60` | `28f48e69120bfc1687e16dad228a675773d9293e2143ab2388daec4e0e6d8e49` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/interpret.ts` | `1b31152eeffeb71d80fbf7bc2c40e25b76de74d6bb0794b248f89ed6b1cfe5c2` | `d1ce3ec813b1ef5e1828be1a55ee9090aa656dcbe5f815fe3caa907b77941499` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/interpret.js` | `a47bd1dd7b122e77c1c783f0356480b1409c916ef31a944d535692b9dacdd2f7` | `0ef568a05a1e6e2c4202154d85ae586e2f50490625eeae39c8d9f19ecd3dd988` |
| `causality-order-strands-baseline.json` | `dependencies.src/analysis/analyze.ts` | `a70965143a76ddb95dc2ff2e3a08c790e55fcf8db09b0b93d3731014012ee643` | `da620222db213c947c970abfffe459a565b7cedcd6eb46f6116046fc708dcf1f` |
| `causality-order-strands-baseline.json` | `dependencies.dist/analysis/analyze.js` | `03b8fb8010c72dd18a2117f796cc82ed03ecaf8b351ad1eb4990ba59914c3961` | `1efca01c1c8afc32be887c892042b293d707410fe2d994decf90553e3f07320b` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-strands.ts` | `919132d12de90b0b59825637e92bfd35bca89799d63cdc2977dc80c132878861` | `b1fa9d0786df6c7ef5457291bcd214022455a29d171c95de25b81b3590672348` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-strands.js` | `a78e77e6c85b1baaa968c6b16bf9230db18ffa85f9fb3438c001b94bb2d01641` | `fe066e9effd1e71c95ce0f75bd8baee5a7ac4c8cdfd76a4907e1c57172606139` |
| `causality-order-strands-current.json` | `files.src/analysis/callbacks.ts` | `91cf3a7bc05b036342aa9508110f0fb9b44f8cbe64364027d9da21671a26ba61` | `f9cb4fc8dd5c5f322f871f7ecd78adaa16023014e530f1ce5f815ab68102a982` |
| `causality-order-strands-current.json` | `files.dist/analysis/callbacks.js` | `68ead157f96a4fd88e876792b72e62f2c3b3349e3e65cf761668d8476b0f3465` | `8bbd05dad8a6d08bcd85821d78353adbff6c71fa3108b554a973733aaac89b4c` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-functions.ts` | `76196deb7c5889b5125f19c47d5104955bf4b174b3221fb2b17fb2d3503fe14d` | `74b47a697928616de681da9bde86f2190616fd2aa730e153cd4a64f1a94c61aa` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-functions.js` | `eb6c87ce6d37fd871d0ddd861387bef0dbdc47a621d353737703382cdeebffc1` | `6b4ec135229feccc7a21ceed37e51409e1f4714514ea98fe0d32399d336df9ce` |
| `causality-order-strands-current.json` | `files.src/analysis/sites.ts` | `6d15282ae4b5e4166fcade61c9adb45a0fa040ecd482b20d0b82357c12038322` | `beb2c99c5dd5e54a23fe09d2a948babbdbb89555208484d3995bfecb88f2fbbb` |
| `causality-order-strands-current.json` | `files.dist/analysis/sites.js` | `d22ac8f5a9d9e6ecf108ba52159c9f649b743cf7f8d8150a30cd1d297d2bad34` | `2230a1dd364d132ebe5b37b9f2447550c4a18a5042165dd6c486621af0ebe992` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-state.ts` | `7c7ec70dd3a372217ff136a327156dfdb7fd1ef3dcbe721fe3b2d361782b13b8` | `6d1b167697853a1a5f5f3c218d03d8391f53241b246fad60c7ebbf9c845778e3` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-state.js` | `86b97719859af605cfb5d79a2a4139b80292323c0cf97b85bbb778d119986bdc` | `2389060d3e69581583dfdb7753a8e7ef79156142ba898552d6af60fea3481648` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-settle.ts` | `7db70a0dea97cc3855fe614c2d990e0171a972749b300e6dadeae250b275d1ae` | `eb04234838d21af47515fd34dc68960942ef5d1bd3782246c0dead04d5c77397` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-settle.js` | `4e29870b350241e08a102e945d190d312ae9fe34e09761e0d1ffefaf3ef28a7a` | `2d9e9d28564ee3f937a779c8b2ba7013c39efe4d214c46d3d6d85d6632801e48` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-calls.ts` | `c153d1349a06fd08151e8980954e2f570c7c8c8888b1016fdea097065b052462` | `6346381bd5d7de168df27f545fd60ca7c5086c26a5b22aedaa0eafa6a205d6b0` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-calls.js` | `41264eb7acaef4f51c405bebb8ec6789682d810e85a0e70cd78a8f4f0c9d6199` | `f4f69edb14788521cac9fad5bcb3a6552b812e0b8dc7b8c4eab5a05c733fd396` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-loops.ts` | `ce80981d778eb5d2d3eb15c4349aab8770cb94081c4fc45bc462a41c26c7f76f` | `4356c58e48f175eb86d4081afa26c35e73a42f1fe6d70c76461a93920731ed6d` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-loops.js` | `659ff5a9f63144b16c8f4613440246538804c6b459bcaf926574df443905bf90` | `fcf91eb013f1dad599de2ae6fc096aa9511c42e7f811c8abffcddd6eb01fa95b` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order-walk.ts` | `a63999b12058dc2fa97cce78417d0e7a798e62a84a000431bfbff8b3dadb8044` | `9fbe8498dd217d203b0fb0fc04ed76ab9a12d28dfc02afd74b2fbf8f05823d56` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-walk.js` | `b1666697f6b8de423a078efe261ae70db2af336c13b0ece1de5df9acdb7a2290` | `62e66fcdb601c32bee5d2eff4db6229077dccf92df3566c41c225d3977b6f36c` |
| `causality-order-strands-current.json` | `files.src/analysis/causality-order.ts` | `20bf97bf46a9e8a26878c57f3a4f4e078458fa841c85f18f3be7218622d1001d` | `15cfe668a171a996aadd3b9213aac3c9a9557dd4d994265e3dea8a7922d1e03f` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order.js` | `cccfdec4ae2b1c1c960fcdd91a1b48e4e42c0fdb98c4e8611964169fc622ca60` | `28f48e69120bfc1687e16dad228a675773d9293e2143ab2388daec4e0e6d8e49` |
| `causality-order-strands-current.json` | `files.src/analysis/interpret.ts` | `1b31152eeffeb71d80fbf7bc2c40e25b76de74d6bb0794b248f89ed6b1cfe5c2` | `d1ce3ec813b1ef5e1828be1a55ee9090aa656dcbe5f815fe3caa907b77941499` |
| `causality-order-strands-current.json` | `files.dist/analysis/interpret.js` | `a47bd1dd7b122e77c1c783f0356480b1409c916ef31a944d535692b9dacdd2f7` | `0ef568a05a1e6e2c4202154d85ae586e2f50490625eeae39c8d9f19ecd3dd988` |
| `causality-order-strands-current.json` | `files.src/analysis/analyze.ts` | `a70965143a76ddb95dc2ff2e3a08c790e55fcf8db09b0b93d3731014012ee643` | `da620222db213c947c970abfffe459a565b7cedcd6eb46f6116046fc708dcf1f` |
| `causality-order-strands-current.json` | `files.dist/analysis/analyze.js` | `03b8fb8010c72dd18a2117f796cc82ed03ecaf8b351ad1eb4990ba59914c3961` | `1efca01c1c8afc32be887c892042b293d707410fe2d994decf90553e3f07320b` |
| `causality-order-strands-current.json` | `files.dist/analysis/causality-order-strands.d.ts` | `6aaf3260ec117d6a5c2e14dadf0f5bdf2760c79254beee2f3a99e615a45d7b41` | `54cee7e4c4647dbc974edb40ca18fe605e8544955c861be0d013fb2efb1696c0` |
| `causality-reduction-documentation.test.ts` | `self-hash of causality-reduction-baseline.json` | `815f57ebb52a8e1c56544f254ccc0e26564832aad6a5f1b05433712612684aea` | `be187ed74221eae63b961cbcf332644394fe64743c714695b91bb6fed5641e50` |
| `may-set-lane-expansion-fixture.ts` | `self-hash of may-set-lane-expansion-baseline.json` | `211a58a6d6737900ca4f6331992e8e8ce2e27e8739880a076d8e360c5d6a704b` | `d410a01e92e7ed22f51bf9e82048c71800c83f3e24d72142ca886fedc41610b0` |
| `causality-lane-documentation-proof.ts` | `self-hash of may-set-lane-expansion-baseline.json` | `211a58a6d6737900ca4f6331992e8e8ce2e27e8739880a076d8e360c5d6a704b` | `d410a01e92e7ed22f51bf9e82048c71800c83f3e24d72142ca886fedc41610b0` |
| `causality-lane-documentation-baseline.json` | `self-hash of may-set-lane-expansion-baseline.json` | `211a58a6d6737900ca4f6331992e8e8ce2e27e8739880a076d8e360c5d6a704b` | `d410a01e92e7ed22f51bf9e82048c71800c83f3e24d72142ca886fedc41610b0` |
| `causality-order-settlement-fixture.ts` | `self-hash of causality-order-settlement-baseline.json` | `62a3e3eb5de6eb5ee0e56e2867494ac13cbd51aef773c978cf37ff7dd61d16ac` | `1069ab83cff3a5af60247db90c749d2a6b2d09989ab12c8f2299e2dab890ce2c` |
| `causality-order-settlement-documentation-proof.ts` | `self-hash of causality-order-settlement-baseline.json` | `62a3e3eb5de6eb5ee0e56e2867494ac13cbd51aef773c978cf37ff7dd61d16ac` | `1069ab83cff3a5af60247db90c749d2a6b2d09989ab12c8f2299e2dab890ce2c` |
| `causality-order-settlement-documentation-baseline.json` | `self-hash of causality-order-settlement-baseline.json` | `62a3e3eb5de6eb5ee0e56e2867494ac13cbd51aef773c978cf37ff7dd61d16ac` | `1069ab83cff3a5af60247db90c749d2a6b2d09989ab12c8f2299e2dab890ce2c` |
| `causality-order-strands-fixture.ts` | `self-hash of causality-order-strands-baseline.json` | `c1f55bc621e6a5b5f71937592c272024f86d3c366c45a0da76b76faf342742d8` | `3aba96c101e5d35817c954e1e4ee0c46adfb5046526a9d84dc5507a4a8410e87` |
| `causality-order-strands-fixture.ts` | `self-hash of causality-order-strands-current.json` | `8a9abee12922e74dcfcbfaa93ba3e3e18cd56730dfe56a973777d62b2eb52e1d` | `746dcdbd82c6de66e322325a37a7e848af3d090d86362aec29d6f88cccd03bc6` |
| `causality-lane-documentation-proof.ts` | `self-hash of causality-lane-documentation-baseline.json` | `a5981e705af1cf27d4c1f6ed65ba9b6a7033a18706d0dcbf63b6cdbb2cefbb30` | `db05c41b50287365ed49cfb5ff8c65c368a0843fbc5a58a2fc7407c6711d3e6e` |
| `causality-order-settlement-documentation-proof.ts` | `self-hash of causality-order-settlement-documentation-baseline.json` | `b3f86f07a8d7b3cc1fc1d38bed4bb26d11daf88cd6b50b4dbe2a6ac6131a0f36` | `a56a5663e0bf0f46c870329c057a6f2dbddffaf344e24481b0ffa066a9eda8b6` |

**未改的哈希**：`causality-reduce` 与 `fanout-cardinality` 的源码 / 产物 / 声明 pin 已与当前文件一致，不在表内。`cli-fold`（`f08e41a6…`）、fold history（`ff6c7443…`、`961359a0…`）、`create-workflow-graph-loader-contract.json`、各 proof 的 `sourceSyntaxSha256` / `emittedSyntaxSha256` / `declarationSyntaxSha256`、历史声明字节与 gold 观测哈希都未动。`docs/evidence/` 里的历史回执未改。

**护栏未动**：`assert.deepEqual` 行为对照、注释清单、声明形状与语法摘要断言、strands 的声明字节相等断言都逐字保留。re-pin 后这 10 个 core 证据文件实测 **34 通过 / 3 失败**。通过的包括 reduction、fanout、may-set、lane facts、settlement 的行为对照，以及 cardinality / reduction 的文档证据。

**3 条未关闭**（不是文件 sha pin，不能靠改哈希数值通过；满足它们的实现过不了普通模式相似度）：

- `causality-graph-lanes.ts` 源码语法摘要必须是 `866b9cba…`。当前 tsc 下只有 99b9ba29 的词法流能同时对上源码、发射和声明语法摘要，oxfmt 后包含率 0.337。重写实现包含率 0.090、run 2、结构 0.009，声明语法摘要已经对齐，源码摘要实际是 `f143bb9e…`。
- `causality-order-settle.ts` 源码语法摘要必须是 `bdc55be0…`。同样只有那份词法流能对上，包含率 0.671、最长相同段 21、结构 0.657。重写实现包含率 0.182、run 7、结构 0.083，声明语法摘要已经对齐，源码摘要实际是 `12828aea…`。
- `causality-order-strands.d.ts` 必须与历史声明逐字节相同。现实现的公开签名已经一致，差在历史 JSDoc。其中 `joinStrands` 的注释块对上游是连续 12 行；写进源码会让最长相同段 ≥ 12。整文件恢复则包含率、run、结构都是 1.000。
