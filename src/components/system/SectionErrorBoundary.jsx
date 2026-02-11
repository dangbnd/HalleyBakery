import { Component } from "react";

/**
 * ErrorBoundary cho từng section — khi 1 section lỗi, chỉ section đó hiện fallback,
 * các phần còn lại của app vẫn hoạt động bình thường.
 */
export default class SectionErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error(`[SectionErrorBoundary] ${this.props.name || "unknown"}:`, error, info);
    }

    render() {
        if (this.state.hasError) {
            // Fallback UI nhẹ nhàng cho từng section
            return (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500 my-4">
                    <p className="font-medium text-gray-700">Không thể hiển thị phần này</p>
                    <p className="mt-1 text-xs">{this.props.name || "Section"} gặp lỗi. Vui lòng tải lại trang.</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="mt-2 rounded-lg border px-3 py-1 text-xs hover:bg-white transition"
                    >
                        Thử lại
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
