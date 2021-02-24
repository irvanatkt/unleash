const NameExistsError = require('../error/name-exists-error');
const InvalidOperationError = require('../error/invalid-operation-error');
const eventType = require('../event-type');
const { nameType } = require('../routes/admin-api/util');
const schema = require('./project-schema');

class ProjectService {
    constructor(
        { projectStore, eventStore, featureToggleStore },
        { getLogger },
        accessService,
    ) {
        this.projectStore = projectStore;
        this.accessService = accessService;
        this.eventStore = eventStore;
        this.featureToggleStore = featureToggleStore;
        this.logger = getLogger('services/project-service.js');
    }

    async getProjects() {
        return this.projectStore.getAll();
    }

    async getProject(id) {
        return this.projectStore.get(id);
    }

    async createProject(newProject, user) {
        const data = await schema.validateAsync(newProject);
        await this.validateUniqueId(data.id);

        await this.projectStore.create(data);
        await this.accessService.createDefaultProjectRoles(user, data.id);

        await this.eventStore.store({
            type: eventType.PROJECT_CREATED,
            createdBy: user.username,
            data,
        });

        return data;
    }

    async updateProject(updatedProject, user) {
        await this.projectStore.get(updatedProject.id);
        const project = await schema.validateAsync(updatedProject);
        await this.eventStore.store({
            type: eventType.PROJECT_UPDATED,
            createdBy: user.username,
            data: project,
        });
        await this.projectStore.update(project);
    }

    async deleteProject(id, user) {
        if (id === 'default') {
            throw new InvalidOperationError(
                'You can not delete the default project!',
            );
        }

        const toggles = await this.featureToggleStore.getFeaturesBy({
            project: id,
            archived: 0,
        });

        if (toggles.length > 0) {
            throw new InvalidOperationError(
                'You can not delete as project with active feature toggles',
            );
        }

        await this.eventStore.store({
            type: eventType.PROJECT_DELETED,
            createdBy: user.username,
            data: { id },
        });
        await this.projectStore.delete(id);
    }

    async validateId(id) {
        await nameType.validateAsync(id);
        await this.validateUniqueId(id);
        return true;
    }

    async validateUniqueId(id) {
        try {
            await this.projectStore.hasProject(id);
        } catch (error) {
            // No conflict, everything ok!
            return;
        }

        // Intentional throw here!
        throw new NameExistsError('A project with this id already exists.');
    }

    async getUsersWithAccess() {
        /*
        { admins: [{userId: 12, name: 'Some Name', email: 'me@mail.com}]}
        { regular: [{userId: 12, name: 'Some Name', email: 'me@mail.com}]}

        */
    }
}

module.exports = ProjectService;
