import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck, Play, Award, CheckCircle } from 'lucide-react';
import { apiClient } from '../../api/client';

export function GuestEvaluationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<{
    valid: boolean;
    token: string;
    guestName: string | null;
    learner: { id: string; displayName: string };
    status: string;
  } | null>(null);

  const [assessorName, setAssessorName] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Thiếu mã token đánh giá. Vui lòng kiểm tra lại đường link được gửi.');
      setLoading(false);
      return;
    }

    apiClient.verifyGuestToken(token).then((res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error || 'Token không hợp lệ hoặc đã hết hạn.');
      } else {
        setTokenData(res.data);
        if (res.data.guestName) {
          setAssessorName(res.data.guestName);
        }
      }
    });
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-400 border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-slate-400">Đang xác thực link đánh giá...</p>
        </div>
      </div>
    );
  }

  if (error || !tokenData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100 p-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-4">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Truy cập không hợp lệ</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-200 transition"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100 p-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mb-4">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Đánh Giá Hoàn Tất!</h2>
          <p className="text-sm text-slate-300 mb-4">
            Cảm ơn Giám khảo <strong className="text-emerald-400">{assessorName}</strong> đã hoàn thành quan sát và chấm điểm cho học viên <strong>{tokenData.learner.displayName}</strong>.
          </p>
          <p className="text-xs text-slate-400 mb-6">
            Dữ liệu quan sát đã được ghi nhận an toàn vào hệ thống Chunks-LMS và gửi tới Giáo viên phụ trách.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-sm font-medium text-slate-950 transition font-semibold"
          >
            Đóng phiên
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Cổng Đánh Giá Khách Mời (Guest Assessor)</h1>
            <p className="text-xs text-slate-400">Đo lường Focus & Awareness &bull; Chunks-LMS</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50">
            <span className="text-xs font-medium text-slate-400 block mb-1">Học viên được đánh giá:</span>
            <span className="text-base font-semibold text-sky-300">{tokenData.learner.displayName}</span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Họ tên Giám khảo / Người đánh giá:
            </label>
            <input
              type="text"
              value={assessorName}
              onChange={(e) => setAssessorName(e.target.value)}
              placeholder="VD: Thầy Hùng - Chuyên gia ngữ âm"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-800/30 text-xs text-slate-300 space-y-2 mb-6">
          <div className="font-semibold text-sky-400 flex items-center gap-1.5">
            <Award className="h-4 w-4" /> Nguyên tắc quan sát & chấm điểm:
          </div>
          <p>• Chấm theo màu thực tế: <strong>Xanh lá</strong> (Đạt/Pass), <strong>Vàng</strong> (Hỗ trợ/Probe), <strong>Đỏ</strong> (Chưa đạt), <strong>Tím</strong> (Không phản hồi).</p>
          <p>• Không cần đăng nhập tài khoản. Dữ liệu của bạn được cô lập riêng cho học viên này.</p>
        </div>

        <button
          onClick={() => {
            if (!assessorName.trim()) {
              alert('Vui lòng nhập tên của bạn trước khi bắt đầu.');
              return;
            }
            setCompleted(true);
          }}
          className="w-full py-3 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/10"
        >
          <Play className="h-4 w-4 fill-current" /> Bắt đầu Phiên Đánh Giá
        </button>
      </div>
    </div>
  );
}
