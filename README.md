# Platform App Content

Nền tảng quản trị nội dung gồm hai ứng dụng: backend CMS dùng Payload CMS 3/Next.js và frontend quản trị dùng React/Refine/Vite. Mỗi ứng dụng được cài và chạy độc lập.

## Yêu cầu

- Node.js `>=20.18.1`
- pnpm 9 trở lên
- PostgreSQL có thể truy cập từ backend

## Cấu hình và khởi chạy backend

```sh
cd backend
cp .env.example .env
```

Sửa `backend/.env`: đặt `DATABASE_URL` thành connection string PostgreSQL, ví dụ `postgresql://USER:PASSWORD@localhost:5432/platform_app_content`, và đặt `PAYLOAD_SECRET` thành chuỗi bí mật riêng. Không commit file `.env`.

Sau đó:

```sh
pnpm install
pnpm dev
```

Mở [http://localhost:3000/admin](http://localhost:3000/admin) để tạo tài khoản quản trị ban đầu. Backend dùng PostgreSQL theo cấu hình tại `backend/src/payload.config.ts`; Docker Compose hiện có cấu hình MongoDB cũ, không dùng cấu hình đó cho backend hiện tại.

## Khởi chạy frontend

Trong terminal khác:

```sh
cd frontend
pnpm install
pnpm dev
```

Mở URL local được Vite/Refine in ra ở terminal. Cấu hình ứng dụng và các provider nằm trong `frontend/src/`.

## Build, lint và test

Chạy các lệnh từ thư mục ứng dụng tương ứng:

```sh
# backend
pnpm build
pnpm lint
pnpm test:int
pnpm test:e2e
```

```sh
# frontend
pnpm build
```

Backend có test Vitest và Playwright. Frontend hiện chưa có script test được khai báo; kiểm tra giao diện thủ công sau thay đổi.

## Cấu trúc repo

- `backend/src/collections/`: Payload collections.
- `backend/tests/`: integration và e2e tests.
- `frontend/src/components/`: UI và component dùng chung.
- `frontend/public/`: static assets.
- `Infra/`: tài liệu/cấu hình hạ tầng.

Xem [AGENTS.md](AGENTS.md) để biết quy ước đóng góp và cách tra cứu code bằng CodeGraph.
