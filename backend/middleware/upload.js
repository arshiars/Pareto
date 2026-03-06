import multer from 'multer'

const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    cb(null, allowed.includes(file.mimetype))
  },
  limits: { fileSize: 10 * 1024 * 1024 },
})

export const uploadExcel = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',                                           // .xls
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false)
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — CMHC templates can be large
})
