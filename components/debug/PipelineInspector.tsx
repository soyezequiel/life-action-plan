import React from 'react';
import './pipeline-inspector.css';

interface PipelineInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
}

export const PipelineInspector: React.FC<PipelineInspectorProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;

  return (
    <div className="pipeline-inspector-overlay" onClick={onClose}>
      <div className="pipeline-inspector-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="pipeline-inspector-header">
          <h2>🔍 Pipeline Context Inspector</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="pipeline-inspector-content">
          {data ? (
            <pre className="json-display">
              {JSON.stringify(data, null, 2)}
            </pre>
          ) : (
            <div className="empty-state">No context data available. Run the pipeline to see results.</div>
          )}
        </div>
        <div className="pipeline-inspector-footer">
          <button className="copy-btn" onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            alert('JSON copied to clipboard!');
          }}>
            Copy JSON
          </button>
        </div>
      </div>
    </div>
  );
};
