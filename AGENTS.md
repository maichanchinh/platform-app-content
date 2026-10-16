# Repository Guidelines

## Cấu trúc dự án
Repo gồm hai ứng dụng độc lập. `backend/` dùng Payload CMS 3, Next.js và PostgreSQL; mã nguồn ở `backend/src/`, cấu hình collection trong `backend/src/collections/`, test ở `backend/tests/`. `frontend/` dùng React, Refine và Vite; mã nguồn ở `frontend/src/`, UI dùng chung ở `frontend/src/components/`, asset tĩnh ở `frontend/public/`. Mỗi ứng dụng có `package.json` và lockfile riêng. Cấu hình hạ tầng nằm trong `Infra/`.

## CodeGraph
Khi thư mục `.codegraph/` tồn tại, hãy dùng CodeGraph trước `grep`, `find` hoặc đọc file để định vị và hiểu code. Ưu tiên MCP `codegraph_explore` nếu khả dụng; nếu không, chạy `codegraph explore "<câu hỏi hoặc tên symbol>"` từ thư mục gốc. Nêu tên file hoặc symbol trong truy vấn để lấy source và luồng gọi. Nếu repo không có `.codegraph/`, bỏ qua CodeGraph.

## Lệnh phát triển và kiểm tra
Chạy lệnh trong thư mục ứng dụng tương ứng; cài dependency bằng `pnpm install`.

- Backend: `pnpm dev`, `pnpm build`, `pnpm start`; kiểm tra bằng `pnpm lint`, `pnpm test:int`, `pnpm test:e2e` hoặc `pnpm test`.
- Frontend: `pnpm dev`, `pnpm build`, `pnpm start`. Frontend hiện chưa khai báo script test.

## Quy ước code
Dùng TypeScript/TSX và theo sát style của file lân cận; ưu tiên indent 2 spaces. Component React đặt tên PascalCase; utility camelCase; hook bắt đầu bằng `use`. Chạy ESLint backend trước khi gửi thay đổi backend. Giữ thay đổi tập trung và không thêm dependency nếu chưa được thống nhất.

## Backend IDs
Mọi ID của collection, Payload system collection và bản ghi backend phải dùng UUID v7. Dùng cơ chế UUID v7 có sẵn của Payload/PostgreSQL; giữ kiểu ID và quan hệ đồng nhất trong migration, API, types và tests.

## Test và pull request
Thêm integration test backend trong `backend/tests/`; dùng Vitest và Playwright theo cấu hình hiện có. Với thay đổi frontend chưa có test tự động, ghi rõ các bước kiểm tra thủ công. Commit dùng subject ngắn, mô tả cụ thể; lịch sử hiện tại có cả tiếng Việt. PR cần nêu mục đích, kiểm tra đã chạy, issue liên quan nếu có, và ảnh chụp cho thay đổi giao diện.

## Cấu hình an toàn
Giữ secrets trong file `.env` bị ignore; không commit credentials, `node_modules` hay output build. Backend cần `DATABASE_URL` PostgreSQL và `PAYLOAD_SECRET`.
