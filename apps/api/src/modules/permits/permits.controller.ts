import type { Request, Response, NextFunction } from 'express';
import { permitsService } from './permits.service.js';
import { transition } from './state-machine/transition-engine.js';
import type { PermitAction } from './state-machine/types.js';

export class PermitsController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = { id: req.user!.id, role: req.user!.role as any };
      const permit = await permitsService.createPermit(req.body, actor);
      res.status(201).json({ permit });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = { id: req.user!.id, role: req.user!.role as any };
      const permit = await permitsService.updatePermit(req.params.id as string, req.body, actor);
      res.status(200).json({ permit });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = { id: req.user!.id, role: req.user!.role as any };
      const data = await permitsService.getPermitById(req.params.id as string, actor);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = { id: req.user!.id, role: req.user!.role as any };
      const data = await permitsService.listPermits(req.query as any, actor);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = { id: req.user!.id, role: req.user!.role as any };
      const data = await permitsService.getPermitStats(actor);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async audit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await permitsService.getAuditTimeline(req.params.id as string);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async addWorkLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = { id: req.user!.id, role: req.user!.role as any };
      const workLog = await permitsService.addWorkLog(
        req.params.id as string,
        req.body.kind,
        req.body.note,
        actor
      );
      res.status(201).json({ workLog });
    } catch (err) {
      next(err);
    }
  }

  handleTransition(action: PermitAction) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = { id: req.user!.id, role: req.user!.role as any };
        const permit = await transition(req.params.id as string, action, actor, req.body || {});
        res.status(200).json({ permit });
      } catch (err) {
        next(err);
      }
    };
  }
}

export const permitsController = new PermitsController();
