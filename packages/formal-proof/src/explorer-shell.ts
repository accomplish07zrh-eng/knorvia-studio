import { profiles } from "./model.js";

export function explorerShell(): string {
  return `
  <main class="app">
    <aside class="side-panel panel">
      <div class="brand">
        <h1>Conversation State Space</h1>
        <p class="subtitle">
          从 GUI 用户视角枚举 compact、fork、goal、消息队列和 query 编辑的组合。每个候选动作先进入笛卡尔积，再由产品 guard 剪枝；未定义路径会保留下来供人工 review，并最终导出为 E2E case。
        </p>
      </div>

      <section class="side-section">
        <div class="panel-header"><h2>参数枚举</h2></div>
        <div class="panel-body controls">
          <div class="control">
            <label for="profileSelect">初始上下文</label>
            <select id="profileSelect">
              ${profiles.map((profile) => `<option value="${profile.id}">${profile.label}</option>`).join("")}
            </select>
          </div>
          <div class="control">
            <label for="roundSelect">递归轮次</label>
            <select id="roundSelect">
              <option value="1">1 轮：只看下一步</option>
              <option value="2">2 轮：动作后继续枚举</option>
              <option value="3" selected>3 轮：推荐</option>
              <option value="4">4 轮：更大状态空间</option>
            </select>
          </div>
          <div class="control">
            <label for="budgetSelect">画布渲染预算</label>
            <select id="budgetSelect">
              <option value="350">350 节点</option>
              <option value="800" selected>800 节点</option>
              <option value="1600">1,600 节点</option>
              <option value="3200">3,200 节点</option>
            </select>
          </div>
          <div class="control">
            <label for="decisionSelect">结果过滤</label>
            <select id="decisionSelect">
              <option value="all">全部结果</option>
              <option value="reject">只看 reject 剪枝</option>
              <option value="undefined">只看 undefined</option>
              <option value="enqueue">只看 queue</option>
              <option value="allow">只看 allow</option>
              <option value="system">只看 system</option>
            </select>
          </div>
        </div>
      </section>

      <section class="side-section">
        <div class="panel-header"><h2>语义统计</h2></div>
        <div class="metrics" aria-label="状态空间统计">
          <div class="metric"><strong id="metricNodes">0</strong><span>语义节点</span></div>
          <div class="metric"><strong id="metricCases">0</strong><span>Review cases</span></div>
          <div class="metric"><strong id="metricRejects">0</strong><span>Reject 剪枝</span></div>
          <div class="metric"><strong id="metricUndefined">0</strong><span>Undefined</span></div>
          <div class="metric"><strong id="metricQueue">0</strong><span>Queue</span></div>
          <div class="metric"><strong id="metricRendered">0</strong><span>图节点</span></div>
        </div>
      </section>

      <section class="side-section rule-section">
        <div class="panel-header"><h2>规则命中</h2></div>
        <div class="panel-body rule-body">
          <p class="hint">点击规则会高亮对应语义节点。reject 是产品规则剪枝，undefined 是还没定义的产品逻辑。</p>
          <div id="ruleList" class="rule-list"></div>
        </div>
      </section>
    </aside>

    <section class="canvas-panel panel">
      <div class="toolbar">
        <div>
          <strong>State-Space DAG</strong>
          <p class="hint">横向按 State、Action、Guard、Effect、Case 展开；等价节点会合并并显示命中次数。拖拽移动，滚轮缩放，点击节点查看详情。</p>
        </div>
        <div class="toolbar-actions">
          <button id="zoomOut" class="toolbar-button" type="button" aria-label="缩小">-</button>
          <button id="zoomIn" class="toolbar-button" type="button" aria-label="放大">+</button>
          <button id="fitTree" class="toolbar-button" type="button">适配</button>
          <button id="resetTree" class="toolbar-button" type="button">重置</button>
          <button id="exportCases" class="toolbar-button" type="button">导出 JSON</button>
        </div>
      </div>
      <div class="graph-shell">
        <svg id="tree" role="img" aria-label="Conversation behavior state-space DAG"></svg>
        <aside id="nodePopover" class="node-popover" hidden>
          <div class="popover-header">
            <div>
              <b id="detailTitle">-</b>
              <span id="detailKind">-</span>
            </div>
            <button id="closeDetail" class="icon-button" type="button" aria-label="关闭节点详情">x</button>
          </div>
          <div class="popover-body detail-grid">
            <div class="detail-row"><b>上下文</b><code id="detailContext">-</code></div>
            <div class="detail-row"><b>产品语义</b><span id="detailText">-</span></div>
            <div class="detail-row"><b>E2E 断言</b><span id="detailE2e">-</span></div>
            <div class="detail-row">
              <b>Review</b>
              <div id="reviewButtons" class="review-buttons"></div>
            </div>
            <div class="detail-row"><b>代表路径</b><ul id="detailPath" class="path-list"></ul></div>
          </div>
        </aside>
      </div>
    </section>
  </main>
`;

}
