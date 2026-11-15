const { HttpUtils } = require('../utils/HttpUtils');

/**
 * ManufacturerController — REST-Controller (@RestController) für `/api/manufacturers`.
 */
class ManufacturerController {
  constructor(manufacturerService, filamentService, projectService) {
    this.manufacturerService = manufacturerService;
    this.filamentService = filamentService;
    this.projectService = projectService;
  }

  async handle(req, res, pathname) {
    if (pathname === '/api/manufacturers' && req.method === 'GET') {
      return HttpUtils.sendJson(res, 200, this.manufacturerService.listManufacturers());
    }

    if (pathname === '/api/manufacturers' && req.method === 'POST') {
      const body = await HttpUtils.parseBody(req);
      const created = this.manufacturerService.createManufacturer(body);
      return HttpUtils.sendJson(res, 201, created);
    }

    const mfgMatch = pathname.match(/^\/api\/manufacturers\/(\d+)$/);
    if (mfgMatch) {
      const mfgId = Number(mfgMatch[1]);

      if (req.method === 'PUT') {
        const body = await HttpUtils.parseBody(req);
        const manufacturers = this.manufacturerService.updateManufacturer(mfgId, body);
        return HttpUtils.sendJson(res, 200, {
          manufacturers,
          filaments: this.filamentService.listFilaments(),
          projects: this.projectService.listProjects()
        });
      }

      if (req.method === 'DELETE') {
        const manufacturers = this.manufacturerService.deleteManufacturer(mfgId);
        return HttpUtils.sendJson(res, 200, { manufacturers });
      }
    }

    return false;
  }
}

module.exports = { ManufacturerController };
