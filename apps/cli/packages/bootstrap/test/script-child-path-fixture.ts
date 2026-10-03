import assert from "node:assert/strict";
import { stableChildObservation, type ChildCase } from "./script-child-fixture.js";

export const childPathCases: ChildCase[] = [
  {
    name: "nested parallel/pipeline scopes keep sibling counters and local failures isolated",
    async run(child) {
      const result = await child({
        body: `
        const p = await parallel([
          async()=>{ await agent("p0"); return parallel([()=>agent("nested"),()=>{throw Error("local");}]); },
          ()=>Promise.reject("local"), , ()=>agent("p3")
        ]);
        const q = await pipeline([1,2],
          async(previous,item,index)=>({previous,item,index,value:await agent("s0_"+index)}),
          async(previous,item,index)=>{if(index===1)throw Error("item failed");
            return {previous,item,index,nested:await parallel([()=>agent("stageNested")])};});
        return {p,q};
      `,
      });
      const requests = result.frames.filter((frame) => frame.kind === "request");
      assert.deepEqual(
        requests.map((frame) => frame.payload.callPath).sort(),
        [
          "root/parallel0/item0/agent0",
          "root/parallel0/item0/parallel0/item0/agent0",
          "root/parallel0/item3/agent0",
          "root/pipeline1/item0/stage0/agent0",
          "root/pipeline1/item0/stage1/parallel0/item0/agent0",
          "root/pipeline1/item1/stage0/agent0",
        ].sort(),
      );
      assert.deepEqual(result.frames.at(-1)?.value, {
        p: [["nested", null], null, null, "p3"],
        q: [
          {
            previous: { previous: 1, item: 1, index: 0, value: "s0_0" },
            item: 1,
            index: 0,
            nested: ["stageNested"],
          },
          null,
        ],
      });
      return stableChildObservation(result);
    },
  },
  {
    name: "pipeline retains original item/index, sparse arrays and zero stages",
    async run(child) {
      const result = await child({
        body: `
        const emptyStages = await pipeline([false,0,null]);
        const sparse = await pipeline([1,,3], (previous,item,index)=>[previous,item,index]);
        const sequential = await pipeline([2], (previous,item,index)=>previous+3,
          (previous,item,index)=>({previous,item,index}));
        return {emptyStages,sparse,sequential, emptyParallel:await parallel([])};
      `,
      });
      assert.deepEqual(result.frames.at(-1)?.value, {
        emptyStages: [false, 0, null],
        sparse: [[1, 1, 0], null, [3, 3, 2]],
        sequential: [{ previous: 5, item: 2, index: 0 }],
        emptyParallel: [],
      });
      return stableChildObservation(result);
    },
  },
  {
    name: "parallel and pipeline reject non-arrays using the fixed errors",
    async run(child) {
      const results = [];
      for (const [body, error] of [
        ["return await parallel({});", "parallel() expects an array of thunks"],
        ["return await pipeline(null);", "pipeline() expects an array of items"],
      ]) {
        const result = await child({ body });
        assert.equal(result.frames.at(-1)?.error, error);
        assert.equal(result.frames.at(-1)?.ok, false);
        results.push(stableChildObservation(result));
      }
      return results;
    },
  },
  {
    name: "agent and block ordinals stay independent across await and undefined completion",
    async run(child) {
      const result = await child({
        body: `await parallel([()=>agent("p")]);
        await agent("root0"); await pipeline([0], ()=>agent("q"));
        await agent("root1"); return undefined;`,
      });
      assert.deepEqual(
        result.frames
          .filter((frame) => frame.kind === "request")
          .map((frame) => frame.payload.callPath),
        [
          "root/parallel0/item0/agent0",
          "root/agent0",
          "root/pipeline1/item0/stage0/agent0",
          "root/agent1",
        ],
      );
      assert.deepEqual(result.frames.at(-1), { kind: "complete", ok: true });
      return stableChildObservation(result);
    },
  },
];
