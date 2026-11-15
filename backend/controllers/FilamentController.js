const { HttpUtils } = require('../utils/HttpUtils');

/**
 * FilamentController — REST-Controller (@RestController) für `/api/filaments`.
 */
class FilamentController {
  constructor(filamentService, manufacturerService, projectService) {
    this.filamentService = filamentService;
    this.manufacturerService = manufacturerService;
    this.projectService = projectService;
  }

  async handle(req, res, pathname) {
    if (pathname === '/api/filaments' && req.method === 'GET') {
      return HttpUtils.sendJson(res, 200, this.filamentService.listFilaments());
    }

    if (pathname === '/api/filaments' && req.method === 'POST') {
      const body = await HttpUtils.parseBody(req);
      const filaments = this.filamentService.createFilament(body);
      return HttpUtils.sendJson(res, 201, {
        filaments,
        manufacturers: this.manufacturerService.listManufacturers(),
        projects: this.projectService.listProjects()
      });
    }

    const weightMatch = pathname.match(/^\/api\/filaments\/(\d+)\/weight$/);
    if (weightMatch && req.method === 'PATCH') {
      const filamentId = Number(weightMatch[1]);
      const body = await HttpUtils.parseBody(req);
      const filaments = this.filamentService.patchWeight(filamentId, body);
      return HttpUtils.sendJson(res, 200, {
        filaments,
        projects: this.projectService.listProjects()
      });
    }

    const filamentMatch = pathname.match(/^\/api\/filaments\/(\d+)$/);
    if (filamentMatch) {
      const filamentId = Number(filamentMatch[1]);

      if (req.method === 'PUT') {
        const body = await HttpUtils.parseBody(req);
        const filaments = this.filamentService.updateFilament(filamentId, body);
        return HttpUtils.sendJson(res, 200, {
          filaments,
          manufacturers: this.manufacturerService.listManufacturers(),
          projects: this.projectService.listProjects()
        });
      }

      if (req.method === 'PATCH') {
        const body = await HttpUtils.parseBody(req);
        const filaments = this.filamentService.patchWeight(filamentId, body);
        return HttpUtils.sendJson(res, 200, {
          filaments,
          projects: this.projectService.listProjects()
        });
      }

      if (req.method === 'DELETE') {
        const filaments = this.filamentService.deleteFilament(filamentId);
        return HttpUtils.sendJson(res, 200, {
          filaments,
          manufacturers: this.manufacturerService.listManufacturers(),
          projects: this.projectService.listProjects()
        });
      }
    }

    return false;
  }
}

module.exports = { FilamentController };
