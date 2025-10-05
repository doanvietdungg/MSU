# Hướng dẫn lập lịch chạy MMM Crawler trên Windows

## Các file đã tạo:

1. **run_crawler.bat** - File batch đơn giản để chạy thủ công
2. **run_crawler_scheduled.bat** - File batch với logging cho việc lập lịch
3. **setup_scheduler.ps1** - Script PowerShell để thiết lập Task Scheduler

## Cách 1: Sử dụng PowerShell Script (Khuyến nghị)

### Bước 1: Mở PowerShell as Administrator
- Nhấn `Win + X` → chọn "Windows PowerShell (Admin)" hoặc "Terminal (Admin)"

### Bước 2: Chạy script thiết lập
```powershell
# Chạy hàng ngày lúc 9:00 AM
.\setup_scheduler.ps1 -Schedule "Daily" -Time "09:00"

# Chạy hàng tuần (thứ 2,4,6 lúc 8:00 AM)
.\setup_scheduler.ps1 -Schedule "Weekly" -Time "08:00" -DaysOfWeek "Monday,Wednesday,Friday"

# Chạy mỗi giờ
.\setup_scheduler.ps1 -Schedule "Hourly" -Time "09:00"
```

### Bước 3: Kiểm tra task đã tạo
- Mở Task Scheduler: `Win + R` → gõ `taskschd.msc`
- Tìm task "MMM Crawler"

## Cách 2: Thiết lập thủ công qua Task Scheduler

### Bước 1: Mở Task Scheduler
- Nhấn `Win + R` → gõ `taskschd.msc`

### Bước 2: Tạo Basic Task
1. Click "Create Basic Task..." ở panel bên phải
2. Đặt tên: "MMM Crawler"
3. Mô tả: "Automated MMM Marketplace Crawler"

### Bước 3: Thiết lập Trigger
- Chọn tần suất (Daily, Weekly, etc.)
- Đặt thời gian chạy

### Bước 4: Thiết lập Action
- Chọn "Start a program"
- Program/script: `D:\MMM-main\run_crawler_scheduled.bat`
- Start in: `D:\MMM-main`

### Bước 5: Thiết lập Settings
- ✅ Run whether user is logged on or not
- ✅ Run with highest privileges
- ✅ Start the task only if the following network connection is available: Any connection

## Cách 3: Sử dụng Command Line

```cmd
# Tạo task chạy hàng ngày lúc 9:00 AM
schtasks /create /tn "MMM Crawler" /tr "D:\MMM-main\run_crawler_scheduled.bat" /sc daily /st 09:00 /ru SYSTEM

# Tạo task chạy mỗi 2 giờ
schtasks /create /tn "MMM Crawler" /tr "D:\MMM-main\run_crawler_scheduled.bat" /sc hourly /mo 2 /ru SYSTEM
```

## Quản lý Task

### Chạy thủ công
```cmd
schtasks /run /tn "MMM Crawler"
```

### Xóa task
```cmd
schtasks /delete /tn "MMM Crawler" /f
```

### Xem thông tin task
```cmd
schtasks /query /tn "MMM Crawler" /v /fo list
```

## Logs

- Logs được lưu trong thư mục `logs/`
- Format: `crawler_YYYY-MM-DD_HH-MM-SS.log`
- Tự động xóa logs cũ (giữ lại 10 file gần nhất)

## Troubleshooting

### Task không chạy
1. Kiểm tra Task Scheduler History
2. Xem log file trong thư mục `logs/`
3. Đảm bảo Node.js đã cài đặt và có trong PATH

### Lỗi quyền
- Chạy PowerShell as Administrator
- Đảm bảo task được thiết lập với quyền SYSTEM

### Kiểm tra Node.js
```cmd
node --version
npm --version
```

## Lưu ý

- Script sẽ chạy ngay cả khi máy tính đang sleep/hibernate
- Đảm bảo máy tính có kết nối internet khi task chạy
- Task sẽ tự động retry nếu bị lỗi
- Logs sẽ giúp debug nếu có vấn đề
