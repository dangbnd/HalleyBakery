import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(p){ super(p); this.state = { error: null }; }
  static getDerivedStateFromError(err){ return { error: err }; }
  componentDidCatch(err, info){ console.error("ErrorBoundary:", err, info); }
  render(){
    if (this.state.error) {
      return (
        <div style={{padding:16,fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas"}}>
          <b>Lỗi hiển thị</b>
          <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
