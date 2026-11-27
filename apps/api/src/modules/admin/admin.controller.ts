import type { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service.js';
import type { ListAdminActivityQuery } from '@ptw/shared';

export class AdminController {
  async listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await adminService.listUsers();
      res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await adminService.createUser(req.body, req.user!.id);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await adminService.updateUser(req.params.id as string, req.body, req.user!.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.resetPassword(
        req.params.id as string,
        req.body.password,
        req.user!.id
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async listPlants(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plants = await adminService.listPlants();
      res.status(200).json({ plants });
    } catch (err) {
      next(err);
    }
  }

  async createPlant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plant = await adminService.createPlant(req.body, req.user!.id);
      res.status(201).json({ plant });
    } catch (err) {
      next(err);
    }
  }

  async updatePlant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plant = await adminService.updatePlant(req.params.id as string, req.body, req.user!.id);
      res.status(200).json({ plant });
    } catch (err) {
      next(err);
    }
  }

  async listAreas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plantId = req.query.plantId as string | undefined;
      const areas = await adminService.listAreas(plantId);
      res.status(200).json({ areas });
    } catch (err) {
      next(err);
    }
  }

  async createArea(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const area = await adminService.createArea(req.body, req.user!.id);
      res.status(201).json({ area });
    } catch (err) {
      next(err);
    }
  }

  async updateArea(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const area = await adminService.updateArea(req.params.id as string, req.body, req.user!.id);
      res.status(200).json({ area });
    } catch (err) {
      next(err);
    }
  }

  async listEquipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const areaId = req.query.areaId as string | undefined;
      const equipment = await adminService.listEquipment(areaId);
      res.status(200).json({ equipment });
    } catch (err) {
      next(err);
    }
  }

  async createEquipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const equipment = await adminService.createEquipment(req.body, req.user!.id);
      res.status(201).json({ equipment });
    } catch (err) {
      next(err);
    }
  }

  async updateEquipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const equipment = await adminService.updateEquipment(
        req.params.id as string,
        req.body,
        req.user!.id
      );
      res.status(200).json({ equipment });
    } catch (err) {
      next(err);
    }
  }

  async listActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminService.listActivity(req.query as unknown as ListAdminActivityQuery);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
