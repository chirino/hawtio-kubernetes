/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesModel.ts"/>
/// <reference path="schema.ts"/>

declare var OSOAuthConfig;

module Kubernetes {

  export var _module = angular.module(pluginName, ['hawtio-core', 'hawtio-ui', 'wiki', 'restmod', 'ui.codemirror']);
  export var controller = PluginHelpers.createControllerFunction(_module, pluginName);
  export var route = PluginHelpers.createRoutingFunction(templatePath);

  _module.config(['$routeProvider', ($routeProvider:ng.route.IRouteProvider) => {
    $routeProvider.when(UrlHelpers.join(context, '/pods'), route('pods.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/podCreate'), route('podCreate.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/podEdit/:id'), route('podEdit.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/pods'), route('pods.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/pods/:id'), route('pod.html', false))
                  .when(UrlHelpers.join(context, 'replicationControllers'), route('replicationControllers.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/replicationControllers'), route('replicationControllers.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/replicationControllers/:id'), route('replicationController.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/replicationControllerCreate'), route('replicationControllerCreate.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/replicationControllerEdit/:id'), route('replicationControllerEdit.html', false))
                  .when(UrlHelpers.join(context, 'services'), route('services.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/services'), route('services.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/services/:id'), route('service.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/serviceCreate'), route('serviceCreate.html', false))
                  .when(UrlHelpers.join(context, '/namespace/:namespace/serviceEdit/:id'), route('serviceEdit.html', false))
                  .when(UrlHelpers.join(context, 'apps'), route('apps.html', false))
                  .when(UrlHelpers.join(context, 'apps/:namespace'), route('apps.html', false))
                  .when(UrlHelpers.join(context, 'hosts'), route('hosts.html', false))
                  .when(UrlHelpers.join(context, 'hosts/:id'), route('host.html', true))
                  .when(UrlHelpers.join(context, 'builds'), route('builds.html', false))
                  .when(UrlHelpers.join(context, 'builds/:id'), route('build.html', true))
                  .when(UrlHelpers.join(context, 'buildLogs/:id'), route('buildLogs.html', true))
                  .when(UrlHelpers.join(context, 'buildConfigs'), route('buildConfigs.html', false))
                  .when(UrlHelpers.join(context, 'buildConfigs/:id'), route('buildConfig.html', true))
                  .when(UrlHelpers.join(context, 'buildConfigEdit/:id'), route('buildConfigEdit.html', true))
                  .when(UrlHelpers.join(context, 'buildConfigCreate'), route('buildConfigCreate.html', true))
                  .when(UrlHelpers.join(context, 'deploymentConfigs'), route('deploymentConfigs.html', false))
                  .when(UrlHelpers.join(context, 'deploymentConfigs/:id'), route('deploymentConfig.html', true))
                  .when(UrlHelpers.join(context, 'imageRepositories'), route('imageRepositories.html', false))
                  .when(UrlHelpers.join(context, 'pipelines'), route('pipelines.html', false))
                  .when(UrlHelpers.join(context, 'overview'), route('overview.html', true))
                  .when(context, { redirectTo: UrlHelpers.join(context, 'apps') });
  }]);

  // set up a promise that supplies the API URL for Kubernetes, proxied if necessary
  _module.factory('KubernetesApiURL', ['jolokiaUrl', 'jolokia', '$q', '$rootScope', (jolokiaUrl:string, jolokia:Jolokia.IJolokia, $q:ng.IQService, $rootScope:ng.IRootScopeService) => {
    var url = masterApiUrl();
    var answer = <ng.IDeferred<string>>$q.defer();
    answer.resolve(url);
    return answer.promise;
  }]);

  _module.factory('AppLibraryURL', ['$rootScope', ($rootScope:ng.IRootScopeService) => {
    return UrlHelpers.join(kubernetesApiUrl(), "/proxy", kubernetesNamespacePath(), "/services/app-library");
  }]);

  _module.factory('WikiGitUrlPrefix', () => {
    return UrlHelpers.join(kubernetesApiUrl(), "/proxy", kubernetesNamespacePath(), "services/app-library");
  });

  _module.factory('wikiRepository', ["$location", "localStorage", ($location, localStorage) => {
    // TODO lets switch to using REST rather than jolokia soon for the wiki

    var url = UrlHelpers.join(kubernetesApiUrl(), "/proxy", kubernetesNamespacePath(), "services/app-library-jolokia/jolokia");
    // TODO what to use here...
    var user = "admin";
    var password = "admin";
    var jolokia = Core.createJolokia(url, user, password);
    var workspace = Core.createRemoteWorkspace(jolokia, $location, localStorage);

    return new Wiki.GitWikiRepository(() => {
      console.log("Creating a using the jolokia URL: " + url);
      var gitRepo = Git.createGitRepository(workspace, jolokia, localStorage);
      console.log("Got git based repo: " + gitRepo);
      return gitRepo;
    });
  }]);

  _module.factory('ConnectDialogService', ['$rootScope', ($rootScope:ng.IRootScopeService) => {
    return  {
            dialog: new UI.Dialog(),
            saveCredentials: false,
            userName: null,
            password: null,
            jolokiaUrl: null,
            containerName: null,
            view: null
    };
  }]);

  _module.filter('kubernetesPageLink', () => entityPageLink);


  function createResource(deferred:ng.IDeferred<ng.resource.IResourceClass>, thing:string, urlTemplate:string,
                          $rootScope: ng.IRootScopeService, $resource: ng.resource.IResourceService, KubernetesApiURL: ng.IPromise<string>) {
    KubernetesApiURL.then((KubernetesApiURL) => {
      var url = UrlHelpers.escapeColons(KubernetesApiURL);
      log.debug("Url for ", thing, ": ", url);
      var resource = $resource(UrlHelpers.join(url, urlTemplate), null, {
        query: { method: 'GET', isArray: false },
        save: { method: 'PUT', params: { id: '@id' } }
      });
      deferred.resolve(resource);
      Core.$apply($rootScope);
    }, (response) => {
      log.debug("Failed to get rest API URL, can't create " + thing + " resource: ", response);
      deferred.reject(response);
      Core.$apply($rootScope);
    });
  }

  _module.factory('KubernetesVersion', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', ($q:ng.IQService, $rootScope: ng.IRootScopeService, $resource: ng.resource.IResourceService, KubernetesApiURL: ng.IPromise<string>) => {
    var answer = <ng.IDeferred<ng.resource.IResourceClass>> $q.defer();
    createResource(answer, 'pods', '/version', $rootScope, $resource, KubernetesApiURL);
    return answer.promise;
  }]);

  _module.factory('KubernetesPods', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', ($q:ng.IQService, $rootScope: ng.IRootScopeService, $resource: ng.resource.IResourceService, KubernetesApiURL: ng.IPromise<string>) => {
    var answer = <ng.IDeferred<ng.resource.IResourceClass>>$q.defer();
    createResource(answer, 'pods', '/api/' + defaultApiVersion + kubernetesNamespacePath() + '/pods/:id', $rootScope, $resource, KubernetesApiURL);
    return answer.promise;
  }]);

  _module.factory('KubernetesReplicationControllers', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', ($q:ng.IQService, $rootScope: ng.IRootScopeService, $resource: ng.resource.IResourceService, KubernetesApiURL: ng.IPromise<string>) => {
    var answer = <ng.IDeferred<ng.resource.IResourceClass>>$q.defer();
    createResource(answer, 'replication controllers', '/api/' + defaultApiVersion + kubernetesNamespacePath() + '/replicationcontrollers/:id', $rootScope, $resource, KubernetesApiURL);
    return answer.promise;
  }]);

  _module.factory('KubernetesServices', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', ($q:ng.IQService, $rootScope: ng.IRootScopeService, $resource: ng.resource.IResourceService, KubernetesApiURL: ng.IPromise<string>) => {
    var answer = <ng.IDeferred<ng.resource.IResourceClass>>$q.defer();
    createResource(answer, 'services', '/api/' + defaultApiVersion + kubernetesNamespacePath() + '/services/:id', $rootScope, $resource, KubernetesApiURL);
    return answer.promise;
  }]);

  _module.factory('KubernetesBuilds', ['restmod', (restmod) => {
    return restmod.model(buildConfigsRestURL());
  }]);

  _module.factory('KubernetesState', [() => {
    return {
      namespaces: [],
      selectedNamespace: null
    };
  }]);

  _module.factory('ServiceRegistry', [() => {
    return new ServiceRegistryService();
  }]);

  _module.factory('KubernetesModel', ['$rootScope', '$http', 'AppLibraryURL', 'KubernetesApiURL', 'KubernetesState', 'KubernetesServices', 'KubernetesReplicationControllers', 'KubernetesPods', 'WatcherService', ($rootScope, $http, AppLibraryURL, KubernetesApiURL, KubernetesState, KubernetesServices, KubernetesReplicationControllers, KubernetesPods, watcher:WatcherService) => {
    return createKubernetesModel($rootScope, $http, AppLibraryURL, KubernetesApiURL, KubernetesState, KubernetesServices, KubernetesReplicationControllers, KubernetesPods, watcher);
  }]);



  _module.run(['viewRegistry', 'workspace', 'ServiceRegistry', 'HawtioNav', (viewRegistry, workspace:Core.Workspace, ServiceRegistry, HawtioNav) => {
    log.debug("Running");
    viewRegistry['kubernetes'] = templatePath + 'layoutKubernetes.html';
    var builder = HawtioNav.builder();
    var apps = builder.id('kube-apps')
                      .href(() => UrlHelpers.join(context, 'apps'))
                      .title(() => 'Apps')
                      .build();

    var services = builder.id('kube-services')
                      .href(() => UrlHelpers.join(context, 'services'))
                      .title(() => 'Services')
                      .build();

    var controllers = builder.id('kube-controllers')
                      .href(() => UrlHelpers.join(context, 'replicationControllers'))
                      .title(() => 'Controllers')
                      .build();

    var pods = builder.id('kube-pods')
                      .href(() => UrlHelpers.join(context, 'pods'))
                      .title(() => 'Pods')
                      .build();

    var hosts = builder.id('kube-hosts')
                      .href(() => UrlHelpers.join(context, 'hosts'))
                      .title(() => 'Hosts')
                      .build();

    var overview = builder.id('kube-overview')
                          .href(() => UrlHelpers.join(context, 'overview'))
                          .title(() => 'Diagram')
                          .build();

    var builds = builder.id('kube-builds')
                      .href(() => UrlHelpers.join(context, 'builds'))
                      .title(() => 'Builds')
                      .build();

    var buildConfigs = builder.id('kube-buildConfigs')
                      .href(() => UrlHelpers.join(context, 'buildConfigs'))
                      .title(() => 'Build Configs')
                      .build();

    var deploys = builder.id('kube-deploys')
                      .href(() => UrlHelpers.join(context, 'deploymentConfigs'))
                      .title(() => 'Deploys')
                      .build();

    var imageRepositories = builder.id('kube-imageRepositories')
                      .href(() => UrlHelpers.join(context, 'imageRepositories'))
                      .title(() => 'Registries')
                      .build();

    var pipelines = builder.id('kube-pipelines')
                      .href(() => UrlHelpers.join(context, 'pipelines'))
                      .title(() => 'Pipelines')
                      .build();

    var repos = builder.id('kube-repos')
                      .href(() => "/forge/repos")
                      .isValid(() => ServiceRegistry.hasService("fabric8-forge") && ServiceRegistry.hasService("gogs-http-service") && !Core.isRemoteConnection())
                      .title(() => 'Repositories')
                      .build();

    var mainTab = builder.id('kubernetes')
                         .rank(200)
                         .defaultPage({
                           rank: 20,
                           isValid: (yes, no) => {
                             if (!Core.isRemoteConnection()) {
                               yes();
                             } else {
                               no();
                             }
                           }
                         })
                         .href(() => context)
                         .title(() => 'Kubernetes')
                         .isValid(() => !Core.isRemoteConnection())
                         .tabs(apps, services, controllers, pods, hosts, overview)
                         .build();
    HawtioNav.add(mainTab);


    var projectsTab = builder.id('openshift')
                         .rank(100)
                         //.href(() => "/forge/repos")
                         .href(() => UrlHelpers.join(context, 'pipelines') + '?sub-tab=kube-pipelines')
                         .title(() => 'Projects')
                         .isValid(() => !Core.isRemoteConnection())
                         .tabs(repos, pipelines, builds, buildConfigs, deploys, imageRepositories)
                         .build();

    HawtioNav.add(projectsTab);
  }]);

  hawtioPluginLoader.registerPreBootstrapTask((next) => {
    $.getScript('osconsole/config.js')
      .done((script, textStatus) => {
        var config:OpenshiftConfig = Kubernetes.osConfig = window['OPENSHIFT_CONFIG'];
        log.debug("Fetched openshift config: ", config);
        var master:string = undefined;
        if (config.api && config.api.k8s) {
          var masterUri = new URI().host(config.api.k8s.hostPort).path(config.api.k8s.prefix);
          if (config.api.k8s.proto) {
            masterUri.protocol(config.api.k8s.proto);
          }
          master = masterUri.toString();
        }
        OSOAuthConfig = config['auth'];
        if (!OSOAuthConfig) {
          Kubernetes.masterUrl = master;
          next();
          return;
        }
        master = OSOAuthConfig.master_uri;
        if (!master) {
          var oauth_authorize_uri = OSOAuthConfig.oauth_authorize_uri;
          if (oauth_authorize_uri) {
            var text = oauth_authorize_uri;
            var idx = text.indexOf("://");
            if (idx > 0) {
              idx += 3;
              idx = text.indexOf("/", idx);
              if (idx > 0) {
                master = text.substring(0, ++idx);
              }
            }
          }
        }
        if (master) {
          Kubernetes.masterUrl = master;
        }
      })
      .fail((response) => {
        log.debug("Error fetching OAUTH config: ", response);
      })
      .always(() => {
        next();
      });
  }, true);

  hawtioPluginLoader.addModule(pluginName);
}
