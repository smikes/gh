/*
 * Copyright 2013-2015, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Henrique Vicente <henriquevicente@gmail.com>
 * @author Eduardo Lundgren <eduardo.lundgren@gmail.com>
 * @author Zeno Rocha <zno.rocha@gmail.com>
 */

'use strict';

// -- Requires -------------------------------------------------------------------------------------

var base = require('../base'),
    git = require('../git'),
    hooks = require('../hooks'),
    logger = require('../logger'),
    openUrl = require('open'),
    inquirer = require('inquirer'),
    url = require('url');

// -- Constructor ----------------------------------------------------------------------------------

function Repo(options) {
    this.options = options;
}

// -- Constants ------------------------------------------------------------------------------------

Repo.DETAILS = {
    alias: 're',
    description: 'Provides a set of util commands to work with Repositories.',
    commands: [
        'browser',
        'clone',
        'delete',
        'fork',
        'list',
        'new'
    ],
    options: {
        'browser': Boolean,
        'clone': Boolean,
        'delete': String,
        'description': String,
        'detailed': Boolean,
        'gitignore': String,
        'fork': String,
        'homepage': String,
        'init': Boolean,
        'list': Boolean,
        'new': String,
        'organization': String,
        'private': Boolean,
        'repo': String,
        'type': ['all', 'member', 'owner', 'public', 'private'],
        'user': String
    },
    shorthands: {
        'B': ['--browser'],
        'c': ['--clone'],
        'D': ['--delete'],
        'd': ['--detailed'],
        'f': ['--fork'],
        'l': ['--list'],
        'N': ['--new'],
        'O': ['--organization'],
        'p': ['--private'],
        'r': ['--repo'],
        't': ['--type'],
        'u': ['--user']
    },
    payload: function(payload, options) {
        options.browser = true;
    }
};

Repo.TYPE_ALL = 'all';
Repo.TYPE_MEMBER = 'member';
Repo.TYPE_OWNER = 'owner';
Repo.TYPE_PRIVATE = 'private';
Repo.TYPE_PUBLIC = 'public';

// -- Commands -------------------------------------------------------------------------------------

Repo.prototype.run = function() {
    var instance = this,
        options = instance.options;

    options.type = options.type || Repo.TYPE_ALL;

    if (options.browser) {
        instance.browser(options.user, options.repo);
    }

    if (options.delete) {
        hooks.invoke('repo.delete', instance, function(afterHooksCallback) {
            logger.logTemplate(
                'Deleting repo {{greenBright options.user "/" options.delete}}', {
                    options: options
                });

            inquirer.prompt(
                [
                    {
                        type: 'input',
                        message: 'Are you sure? This action CANNOT be undone. [y/N]',
                        name: 'confirmation'
                    }
                ], function(answers) {
                    if (answers.confirmation.toLowerCase() === 'y') {
                        instance.delete(options.user, options.delete, function(err) {
                            if (err) {
                                logger.error('Can\'t delete repo.');
                                return;
                            }

                            afterHooksCallback();
                        });
                    }
                    else {
                        logger.log('Not deleted.');
                    }
                });
        });
    }

    if (options.fork) {
        hooks.invoke('repo.fork', instance, function(afterHooksCallback) {
            var user = options.loggedUser;

            if (options.organization) {
                user = options.organization;
            }

            options.repo = options.fork;

            logger.logTemplate(
                'Forking repo {{greenBright options.user "/" options.repo}} on {{greenBright user "/" options.repo}}', {
                    options: options,
                    user: user
                });

            instance.fork(function(err1, repo) {
                if (err1) {
                    logger.error('Can\'t fork. ' + JSON.parse(err1).message);
                    return;
                }

                logger.logTemplate('https://github.com/' + user + '/' +
                    options.repo, {options: options});

                if (repo && options.clone) {
                    instance.clone_(options.loggedUser, options.repo, repo.ssh_url);
                }

                afterHooksCallback();
            });
        });
    }

    if (options.list) {
        logger.logTemplate(
            'Listing {{greenBright options.type}} repos for {{greenBright options.user}}', {
                options: options
            });

        instance.list(options.user, function(err) {
            if (err) {
                logger.error('Can\'t list repos.');
            }
        });
    }

    if (options.new) {
        hooks.invoke('repo.new', instance, function(afterHooksCallback) {
            options.repo = options.new;

            if (options.organization) {
                options.user = options.organization;
            }

            logger.logTemplate(
                'Creating a new repo on {{greenBright options.user "/" options.new}}', {
                    options: options
                });

            instance.new(function(err1, repo) {
                if (err1) {
                    logger.error('Can\'t create new repo. ' + JSON.parse(err1.message).message);
                    return;
                }

                logger.logTemplate('{{repoLink}}', {
                    options: options
                });

                if (repo && options.clone) {
                    instance.clone_(options.user, options.repo, repo.ssh_url);
                }

                afterHooksCallback();
            });
        });
    }
};

Repo.prototype.browser = function(user, repo) {
    openUrl('https://github.com/' + user + '/' + repo);
};

Repo.prototype.clone_ = function(user, repo, repo_url) {
    logger.logTemplate(
        'Cloning {{greenBright user "/" repo}}', {
            user: user,
            repo: repo
        });

    git.clone(url.parse(repo_url).href, repo);
};

Repo.prototype.delete = function(user, repo, opt_callback) {
    var payload;

    payload = {
        user: user,
        repo: repo
    };

    base.github.repos.delete(payload, opt_callback);
};

Repo.prototype.list = function(user, opt_callback) {
    var instance = this,
        options = instance.options,
        payload;

    payload = {
        type: options.type,
        user: user
    };

    if (options.type === 'public' || options.type === 'private') {
        if (user !== options.user) {
            logger.error('You can only list public and private repos of your own.');
        }
        else {
            base.github.repos.getAll(payload, function(err, repos) {
                instance.listCallback_(err, repos, opt_callback);
            });
        }
    }
    else {
        base.github.repos.getFromUser(payload, function(err, repos) {
            instance.listCallback_(err, repos, opt_callback);
        });
    }
};

Repo.prototype.listCallback_ = function(err, repos, opt_callback) {
    var instance = this,
        options = instance.options;

    if (err && !options.all) {
        logger.error(logger.getErrorMessage(err));
    }

    if (repos && repos.length > 0) {
        logger.logTemplateFile('repo.handlebars', {
            detailed: options.detailed,
            repos: repos,
            user: options.user
        });

        opt_callback && opt_callback(err);
    }
};

Repo.prototype.fork = function(opt_callback) {
    var instance = this,
        options = instance.options,
        payload;

    payload = {
        user: options.user,
        repo: options.repo
    };

    if (options.organization) {
        payload.organization = options.organization;
    }

    base.github.repos.fork(payload, opt_callback);
};

Repo.prototype.new = function(opt_callback) {
    var instance = this,
        options = instance.options,
        payload,
        method = 'create';

    options.description = options.description || '';
    options.gitignore = options.gitignore || '';
    options.homepage = options.homepage || '';
    options.init = options.init || false;

    if (options.type === Repo.TYPE_PRIVATE) {
        options.private = true;
    }

    options.private = options.private || false;

    if (options.gitignore) {
        options.init = true;
    }

    payload = {
        auto_init: options.init,
        description: options.description,
        gitignore_template: options.gitignore,
        homepage: options.homepage,
        name: options.new,
        private: options.private
    };

    if (options.organization) {
        method = 'createFromOrg';
        payload.org = options.organization;
    }

    base.github.repos[method](payload, opt_callback);
};

exports.Impl = Repo;
