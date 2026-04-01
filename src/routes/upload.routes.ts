import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { uploadToS3 } from '../services/s3.service.js';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});

router.post('/', upload.single('image'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({
                success: false,
                message: 'No image file provided',
            });
            return;
        }

        const folder = req.body.folder || 'misc';

        const imageUrl = await uploadToS3(
            req.file.buffer,
            req.file.originalname,
            folder,
            req.file.mimetype
        );

        res.status(200).json({
            success: true,
            data: {
                imageUrl,
            },
        });
    } catch (error) {
        next(error);
    }
});

router.post('/bulk', upload.array('images', 5), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            res.status(400).json({
                success: false,
                message: 'No image files provided',
            });
            return;
        }

        const folder = req.body.folder || 'misc';

        const uploadPromises = files.map(file =>
            uploadToS3(
                file.buffer,
                file.originalname,
                folder,
                file.mimetype
            )
        );

        const imageUrls = await Promise.all(uploadPromises);

        res.status(200).json({
            success: true,
            data: {
                imageUrls,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
