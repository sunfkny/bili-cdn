declare module "virtual:bcdn-nodes" {
  const nodeData: Array<[
    string,
    string,
    Array<[string, string, Array<string | [string, string]>]>,
  ]>;
  export default nodeData;
}
