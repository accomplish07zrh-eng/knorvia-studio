import { test } from "node:test";

const selected = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
const plain = (value) => JSON.parse(JSON.stringify(value));
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const drain = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function check(name, run) {
  if (!selected || selected === name) test(name, run);
}
export function createIndexOwnerPort(events) {
  return class Port {
    listeners = new Map();
    closed = false;
    once(name, callback) {
      const list = this.listeners.get(name) ?? [];
      list.push(callback);
      this.listeners.set(name, list);
    }
    close() {
      this.closed = true;
      events.push("port-close");
      const list = this.listeners.get("close") ?? [];
      this.listeners.delete("close");
      for (const callback of list) callback();
    }
  };
}
export { test, selected, plain, defer, drain, check };
