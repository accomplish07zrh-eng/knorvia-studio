// SPDX-License-Identifier: Apache-2.0
// WebFetch 预授权判定：整站预授权的域名直接放行；只开放部分路径的域名要落在前缀内。
//
// 域名清单按技术族分组书写（协议/语言官方文档、Web 框架、Python 生态、JVM、.NET 与移动、
// 数据与存储、云与运维、测试与引擎、工具链），一行一族，核对时比 82 行平铺更容易看出缺了哪一类。
// 路径前缀匹配前先拒绝编码过的斜杠/反斜杠/点，避免用 %2f、%5c、%2e 绕过前缀判断。

const PREAPPROVED_HOST_GROUPS: readonly string[] = [
  "modelcontextprotocol.io agentskills.io",
  "docs.python.org en.cppreference.com docs.oracle.com learn.microsoft.com developer.mozilla.org",
  "go.dev pkg.go.dev www.php.net docs.swift.org kotlinlang.org ruby-doc.org doc.rust-lang.org",
  "www.typescriptlang.org react.dev angular.io vuejs.org nextjs.org expressjs.com nodejs.org bun.sh",
  "jquery.com getbootstrap.com tailwindcss.com d3js.org threejs.org redux.js.org webpack.js.org jestjs.io reactrouter.com",
  "docs.djangoproject.com flask.palletsprojects.com fastapi.tiangolo.com pandas.pydata.org numpy.org www.tensorflow.org pytorch.org scikit-learn.org matplotlib.org requests.readthedocs.io jupyter.org",
  "laravel.com symfony.com docs.spring.io hibernate.org tomcat.apache.org gradle.org maven.apache.org",
  "asp.net dotnet.microsoft.com blazor.net reactnative.dev docs.flutter.dev developer.apple.com developer.android.com",
  "keras.io spark.apache.org",
  "www.mongodb.com redis.io www.postgresql.org dev.mysql.com www.sqlite.org graphql.org prisma.io docs.getdbt.com",
  "docs.aws.amazon.com cloud.google.com kubernetes.io www.docker.com www.terraform.io www.ansible.com",
  "docs.stripe.com docs.netlify.com devcenter.heroku.com cypress.io selenium.dev",
  "docs.unity.com docs.unrealengine.com git-scm.com nginx.org httpd.apache.org",
];

const PREAPPROVED_HOSTS: ReadonlySet<string> = new Set(
  PREAPPROVED_HOST_GROUPS.join(" ").split(" "),
);

const PREAPPROVED_PATH_PREFIXES: ReadonlyMap<string, readonly string[]> = new Map<
  string,
  readonly string[]
>([
  ["wordpress.org", ["/documentation"]],
  ["huggingface.co", ["/docs"]],
  ["www.kaggle.com", ["/docs"]],
  ["vercel.com", ["/docs"]],
]);

/** 编码过的斜杠、反斜杠与点（允许再编码一层 %25）。 */
const ENCODED_PATH_ESCAPE = /%(25)*(2f|5c|2e)/iu;

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isWithinPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isWebFetchPreapprovedUrl(value: string): boolean {
  const parsed = parseUrl(value);
  if (parsed === undefined) return false;
  if (PREAPPROVED_HOSTS.has(parsed.hostname)) return true;

  const allowedPrefixes = PREAPPROVED_PATH_PREFIXES.get(parsed.hostname);
  if (allowedPrefixes === undefined) return false;
  if (ENCODED_PATH_ESCAPE.test(parsed.pathname)) return false;
  return allowedPrefixes.some((prefix) => isWithinPrefix(parsed.pathname, prefix));
}
