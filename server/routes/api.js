import express from 'express';
import { folderController } from '../controllers/folderController.js';
import { fileController } from '../controllers/fileController.js';
import { inboxController } from '../controllers/inboxController.js';
import { promptController } from '../controllers/promptController.js';
import { linkController } from '../controllers/linkController.js';
import { systemController } from '../controllers/systemController.js';
import { aiController } from '../controllers/aiController.js';
import { authController } from '../controllers/authController.js';
import { driveController } from '../controllers/driveController.js';
import { uploadMiddleware } from '../middlewares/upload.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

// ── Public / Health / Auth ──────────────────────────────────────────────────
router.get('/status', optionalAuth, systemController.getStatus);
router.get('/auth/config', authController.getConfig);
router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);
router.get('/auth/verify', requireAuth, authController.verify);

// ── All routes below require a valid JWT ──────────────────────────────────────
router.use(requireAuth);

// Folders
router.get('/folders', folderController.getAll);
router.post('/folders', folderController.create);
router.post('/folders/prune-empty', folderController.pruneEmpty);
router.delete('/folders/empty', folderController.pruneEmpty);
router.patch('/folders/:id', folderController.update);
router.delete('/folders/:id', folderController.delete);

// Files & Upload — upload + named sub-routes MUST come before the :id wildcard
router.get('/files', fileController.getAll);
router.post('/files/upload', uploadMiddleware.array('files', 50), fileController.upload);
router.post('/files/auto-organize-all', fileController.autoOrganizeAll);
router.delete('/trash', fileController.emptyTrash);
router.get('/files/:id', fileController.getById);
router.get('/files/:id/download', fileController.download);
router.get('/files/:id/content', fileController.getContent);
router.post('/files/:id/analyze', fileController.analyze);
router.post('/files/:id/restore', fileController.restore);
router.post('/files/:id/organize', inboxController.organize);
router.patch('/files/:id', fileController.update);
router.delete('/files/:id', fileController.delete);

// Inbox
router.get('/inbox', inboxController.getAll);
router.post('/inbox/:id/organize', inboxController.organize);

// Prompts / Knowledge Hub
router.get('/prompts', promptController.getAll);
router.post('/prompts', promptController.create);
router.patch('/prompts/:id', promptController.update);
router.delete('/prompts/:id', promptController.delete);

// Links / Web Bookmarks Hub
router.get('/links', linkController.getAll);
router.get('/links/:id', linkController.getById);
router.post('/links', linkController.create);
router.post('/links/:id/analyze', linkController.analyze);
router.patch('/links/:id', linkController.update);
router.delete('/links/:id', linkController.delete);

// AI — Smart Metadata, Agent, Search
router.get('/ai/status', aiController.status);
router.post('/ai/ask', aiController.ask);
router.post('/ai/reset', aiController.resetMemory);

// Google Drive — BYOD Storage Status
router.get('/drive/status', driveController.status);

export default router;
