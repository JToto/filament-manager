const { HttpUtils } = require('../utils/HttpUtils');

/**
 * SettingsController — REST-Controller (@RestController) für `/api/settings` und `/api/bootstrap`.
 */
class SettingsController {
  constructor(settingsService, manufacturerService, filamentService, projectService) {
    this.settingsService = settingsService;
    this.manufacturerService = manufacturerService;
    this.filamentService = filamentService;
    this.projectService = projectService;
  }

  async handle(req, res, pathname) {
    if (pathname === '/api/bootstrap' && req.method === 'GET') {
      return HttpUtils.sendJson(res, 200, {
        manufacturers: this.manufacturerService.listManufacturers(),
        filaments: this.filamentService.listFilaments(),
        projects: this.projectService.listProjects(),
        settings: this.settingsService.getSettings()
      });
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      return HttpUtils.sendJson(res, 200, this.settingsService.getSettings());
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await HttpUtils.parseBody(req);
      const settings = this.settingsService.updateSettings(body);
      return HttpUtils.sendJson(res, 200, {
        settings,
        projects: this.projectService.listProjects()
      });
    }

    return false;
  }
}

module.exports = { SettingsController };
