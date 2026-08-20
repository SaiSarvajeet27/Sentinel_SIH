import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Mail, ExternalLink, Lock, User, Shield, Terminal, FileText, Skull } from 'lucide-react';
import type { AttackNodeData } from '../../types/soc';
import { SeverityBadge } from '../common/SeverityBadge';

type CustomNodeProps = NodeProps<Node<AttackNodeData>>;

export const CustomAttackNode = memo(({ data, selected }: CustomNodeProps) => {
  const nodeData = data as AttackNodeData;

  const getIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-5 h-5 text-blue-400" />;
      case 'link': return <ExternalLink className="w-5 h-5 text-amber-400" />;
      case 'lock': return <Lock className="w-5 h-5 text-orange-400" />;
      case 'user': return <User className="w-5 h-5 text-purple-400" />;
      case 'shield': return <Shield className="w-5 h-5 text-indigo-400" />;
      case 'terminal': return <Terminal className="w-5 h-5 text-red-400" />;
      case 'file': return <FileText className="w-5 h-5 text-red-500" />;
      case 'skull': default: return <Skull className="w-5 h-5 text-red-500 animate-bounce" />;
    }
  };

  const isCritical = nodeData.severity === 'CRITICAL';

  return (
    <div
      className={`w-60 rounded-xl p-3 transition-all duration-200 cursor-pointer bg-soc-card border shadow-soc-card ${
        selected
          ? 'border-soc-accent ring-2 ring-soc-accent/40 scale-105 shadow-glow-cyan'
          : isCritical
          ? 'border-red-500/60 dark:border-red-800/80 hover:border-red-500 shadow-sm dark:shadow-glow-red'
          : 'border-soc-border hover:border-soc-borderLight'
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-soc-accent border-2 border-soc-bg" />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[9px] font-mono font-bold text-soc-textMuted uppercase tracking-widest">{nodeData.stage}</span>
        <SeverityBadge severity={nodeData.severity} size="sm" showIcon={false} />
      </div>

      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-soc-secondaryCard border border-soc-border shrink-0">
          {getIcon(nodeData.iconType)}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-bold text-soc-textPrimary font-mono leading-snug truncate">{nodeData.label}</h4>
          <p className="text-[10px] text-soc-textMuted font-mono mt-0.5 truncate">{nodeData.device} • {nodeData.timestamp}</p>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-soc-accent border-2 border-soc-bg" />
    </div>
  );
});

CustomAttackNode.displayName = 'CustomAttackNode';
