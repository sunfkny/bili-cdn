import packedNodeData from "virtual:bcdn-nodes";
import { decodeNodeData } from "./node-data-codec";

export const nodeData = decodeNodeData(packedNodeData);
