const fs = require('node:fs');
const { HttpUtils } = require('../utils/HttpUtils');

/**
 * ProjectController — REST-Controller (@RestController) für `/api/projects` und `/api/project-items`.
 */
class ProjectController {
  constructor(projectService) {
    this.projectService = projectService;
  }

  async handle(req, res, pathname) {
    if (pathname === '/api/projects' && req.method === 'GET') {
      return HttpUtils.sendJson(res, 200, this.projectService.listProjects());
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const body = await HttpUtils.parseBody(req);
      const created = this.projectService.createProject(body);
      return HttpUtils.sendJson(res, 201, created);
    }

    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch) {
      const projectId = Number(projectMatch[1]);

      if (req.method === 'PUT') {
        const body = await HttpUtils.parseBody(req);
        const projects = this.projectService.updateProject(projectId, body);
        return HttpUtils.sendJson(res, 200, { projects });
      }

      if (req.method === 'PATCH') {
        const body = await HttpUtils.parseBody(req);
        const projects = this.projectService.patchProject(projectId, body);
        return HttpUtils.sendJson(res, 200, { projects });
      }

      if (req.method === 'DELETE') {
        const projects = this.projectService.deleteProject(projectId);
        return HttpUtils.sendJson(res, 200, { projects });
      }
    }

    const projectThreeMfMatch = pathname.match(/^\/api\/projects\/(\d+)\/threemf$/);
    if (projectThreeMfMatch) {
      const projectId = Number(projectThreeMfMatch[1]);

      if (req.method === 'POST') {
        const rawFilename = req.headers['x-filename']
          ? decodeURIComponent(String(req.headers['x-filename']))
          : 'projekt.3mf';
        const overwriteImage =
          req.headers['x-overwrite-image'] === '1' ||
          req.headers['x-overwrite-image'] === 'true';
        const replaceItems =
          req.headers['x-replace-items'] === '1' ||
          req.headers['x-replace-items'] === 'true';
        const buffer = await HttpUtils.parseRawBody(req);

        const result = await this.projectService.uploadAndImportThreeMf(projectId, {
          rawFilename,
          buffer,
          overwriteImage,
          replaceItems
        });
        return HttpUtils.sendJson(res, 200, result);
      }

      if (req.method === 'GET') {
        const { storedPath, downloadName } =
          this.projectService.getThreeMfDownloadInfo(projectId);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`
        });
        fs.createReadStream(storedPath).pipe(res);
        return true;
      }

      if (req.method === 'DELETE') {
        const projects = this.projectService.removeThreeMf(projectId);
        return HttpUtils.sendJson(res, 200, { projects });
      }
    }

    const openSlicerMatch = pathname.match(/^\/api\/projects\/(\d+)\/open-slicer$/);
    if (openSlicerMatch && req.method === 'POST') {
      const projectId = Number(openSlicerMatch[1]);
      const result = await this.projectService.openInBambuStudio(projectId);
      return HttpUtils.sendJson(res, 200, result);
    }

    const projectItemsMatch = pathname.match(/^\/api\/projects\/(\d+)\/items$/);
    if (projectItemsMatch && req.method === 'POST') {
      const projectId = Number(projectItemsMatch[1]);
      const body = await HttpUtils.parseBody(req);
      const projects = this.projectService.addProjectItem(projectId, body);
      return HttpUtils.sendJson(res, 201, { projects });
    }

    const projectDeductMatch = pathname.match(/^\/api\/projects\/(\d+)\/deduct$/);
    if (projectDeductMatch && req.method === 'POST') {
      const projectId = Number(projectDeductMatch[1]);
      const result = this.projectService.deductProjectFromStock(projectId);
      return HttpUtils.sendJson(res, 200, result);
    }

    const itemMatch = pathname.match(/^\/api\/project-items\/(\d+)$/);
    if (itemMatch) {
      const itemId = Number(itemMatch[1]);

      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = await HttpUtils.parseBody(req);
        const projects = this.projectService.updateProjectItem(itemId, body);
        return HttpUtils.sendJson(res, 200, { projects });
      }

      if (req.method === 'DELETE') {
        const projects = this.projectService.deleteProjectItem(itemId);
        return HttpUtils.sendJson(res, 200, { projects });
      }
    }

    return false;
  }
}

module.exports = { ProjectController };
