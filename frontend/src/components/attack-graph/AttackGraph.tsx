import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import { CustomAttackNode } from './CustomAttackNode';
import { NodeDetailPanel } from './NodeDetailPanel';
import { AttackNodeData } from '../../types/soc';
import { useSOC } from '../common/SOCContext';

import { useTheme } from '../common/ThemeContext';

const nodeTypes = {
  attackNode: CustomAttackNode,
};

interface Props {
  unlockedCount?: number;
}

export const AttackGraph: React.FC<Props> = ({ unlockedCount }) => {
  const { attackNodes: storeNodes, attackEdges: storeEdges } = useSOC();
  const { theme } = useTheme();

  const getFilteredNodes = useCallback(() => {
    // storeNodes can legitimately be empty for a moment — the real graph
    // is fetched asynchronously and starts empty until it resolves — so
    // `[storeNodes[0]]` must not be handed to ReactFlow as `[undefined]`.
    if (storeNodes.length === 0) return [];
    if (unlockedCount !== undefined) {
      if (unlockedCount === 0) return [storeNodes[0]];
      return storeNodes.slice(0, Math.min(unlockedCount, storeNodes.length));
    }
    return storeNodes;
  }, [unlockedCount, storeNodes]);

  const getFilteredEdges = useCallback(() => {
    const nodes = getFilteredNodes();
    const nodeIds = new Set(nodes.map((n) => n.id));
    return storeEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [getFilteredNodes, storeEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(getFilteredNodes() as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(getFilteredEdges());
  const [selectedNodeData, setSelectedNodeData] = useState<AttackNodeData | null>(null);

  // Sync state whenever unlockedCount or storeNodes/Edges change
  useEffect(() => {
    setNodes(getFilteredNodes() as Node[]);
    setEdges(getFilteredEdges());
  }, [unlockedCount, storeNodes, storeEdges, setNodes, setEdges, getFilteredNodes, getFilteredEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeData(node.data as AttackNodeData);
  }, []);

  return (
    <div className="relative w-full h-[600px] bg-soc-bg border border-soc-border rounded-xl overflow-hidden flex">
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={theme === 'dark' ? '#1F2937' : '#CBD5E1'} />
          <Controls />
        </ReactFlow>

        {/* Floating Legend */}
        <div className="absolute top-4 left-4 bg-soc-card/95 border border-soc-border p-3 rounded-lg backdrop-blur-md text-xs font-mono z-10 pointer-events-none space-y-1 shadow-sm">
          <div className="font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
            <span>Attack Progression Flow</span>
            {unlockedCount !== undefined && (
              <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 text-[10px]">
                {nodes.length} / {storeNodes.length} Nodes Active
              </span>
            )}
          </div>
          <div className="text-[11px] text-soc-textMuted">Click any node to inspect event details & evidence payload.</div>
        </div>
      </div>

      {/* Slide-out detail drawer */}
      {selectedNodeData && (
        <NodeDetailPanel nodeData={selectedNodeData} onClose={() => setSelectedNodeData(null)} />
      )}
    </div>
  );
};
