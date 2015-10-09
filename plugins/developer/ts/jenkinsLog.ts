/// <reference path="../../includes.ts"/>
/// <reference path="../../kubernetes/ts/kubernetesHelpers.ts"/>
/// <reference path="developerEnrichers.ts"/>
/// <reference path="developerHelpers.ts"/>
/// <reference path="developerNavigation.ts"/>

module Developer {

  export var JenkinsLogController = controller("JenkinsLogController",
    ["$scope", "KubernetesModel", "KubernetesState", "KubernetesSchema", "$templateCache", "$location", "$routeParams", "$http", "$timeout", "KubernetesApiURL", "ServiceRegistry",
      ($scope, KubernetesModel:Kubernetes.KubernetesModelService, KubernetesState, KubernetesSchema,
       $templateCache:ng.ITemplateCacheService, $location:ng.ILocationService, $routeParams, $http, $timeout, KubernetesApiURL, ServiceRegistry) => {

        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;

        $scope.id = $routeParams["id"];
        $scope.jobId = $routeParams["job"];
        $scope.buildId = $routeParams["build"];
        $scope.schema = KubernetesSchema;
        $scope.entityChangedCache = {};

        $scope.log = {
          html: "",
          start: 0,
          firstIdx: null
        };

        $scope.$on('kubernetesModelUpdated', function () {
          updateJenkinsLink();
          Core.$apply($scope);
        });


        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.breadcrumbConfig = createJenkinsBreadcrumbs($scope.id, $scope.jobId, $scope.buildId);
        $scope.subTabConfig = createJenkinsSubNavBars($scope.id, $scope.jobId, $scope.buildId, {
          label: "Log",
          title: "Views the logs of this build"
        });


        function updateJenkinsLink() {
          var jenkinsUrl = jenkinsLink();
          if (jenkinsUrl) {
            $scope.$viewJenkinsBuildLink = UrlHelpers.join(jenkinsUrl, "job", $scope.jobId, $scope.buildId);
            $scope.$viewJenkinsLogLink = UrlHelpers.join($scope.$viewJenkinsBuildLink, "console");
          }
        }

        var querySize = 50000;

        $scope.$keepPolling = () => Kubernetes.keepPollingModel;
        $scope.fetch = PollHelpers.setupPolling($scope, (next:() => void) => {
          if ($scope.jobId) {
            var url = Kubernetes.kubernetesProxyUrlForServiceCurrentNamespace(jenkinsServiceNameAndPort, UrlHelpers.join("job", $scope.jobId, $scope.buildId, "fabric8/logHtml?tail=1&start=" + $scope.log.start + "&size=" + querySize));
            if ($scope.log.firstIdx !== null) {
              url += "&first=" + $scope.log.firstIdx;
            }
            if (url && (!$scope.log.fetched || Kubernetes.keepPollingModel)) {
              $http.get(url).
                success(function (data, status, headers, config) {
                  if (data) {
                    var replaceClusterIPsInHtml = replaceClusterIpFunction();

                    if (!$scope.log.logs) {
                      $scope.log.logs = [];
                    }
                    var lines = data.lines;
                    var returnedLength = data.returnedLength;
                    var logLength = data.logLength;
                    var returnedStart = data.start;
                    var earlierLog = false;
                    if (angular.isDefined(returnedStart)) {
                      earlierLog = returnedStart < $scope.log.start;
                    }
                    var lineSplit = data.lineSplit;
                    // log.info("start was: " + $scope.log.start + " first: " + $scope.log.firstIdx + " => returnedLength: " + returnedLength + " logLength: " + logLength +  " returnedStart: " + returnedStart + " earlierLog: " + earlierLog + " lineSplit: " + lineSplit);
                    if (lines) {
                      var currentLogs = $scope.log.logs;

                      // lets re-join split lines
                      if (lineSplit && currentLogs.length) {
                        var lastIndex;
                        var restOfLine;
                        if (earlierLog) {
                          lastIndex = 0;
                          restOfLine = lines.pop();
                          if (restOfLine) {
                            currentLogs[lastIndex] = replaceClusterIPsInHtml(restOfLine + currentLogs[lastIndex]);
                          }
                        } else {
                          lastIndex = currentLogs.length - 1;
                          restOfLine = lines.shift();
                          if (restOfLine) {
                            currentLogs[lastIndex] = replaceClusterIPsInHtml(currentLogs[lastIndex] + restOfLine);
                          }
                        }
                      }
                      for (var i = 0; i < lines.length; i++) {
                        lines[i] = replaceClusterIPsInHtml(lines[i]);
                      }
                      if (earlierLog) {
                        $scope.log.logs = lines.concat(currentLogs);
                      } else {
                        $scope.log.logs = currentLogs.concat(lines);
                      }
                    }
                    var moveForward = true;
                    if (angular.isDefined(returnedStart)) {
                      if (returnedStart > $scope.log.start && $scope.log.start === 0) {
                        // we've jumped to the end of the file to read the tail of it
                        $scope.log.start = returnedStart;
                        $scope.log.firstIdx = returnedStart;
                      } else if ($scope.log.firstIdx === null) {
                        // lets remember where the first request started
                        $scope.log.firstIdx = returnedStart;
                      } else if (returnedStart < $scope.log.firstIdx) {
                        // we've got an earlier bit of the log
                        // after starting at the tail
                        // so lets move firstIdx backwards and leave start as it is (at the end of the file)
                        $scope.log.firstIdx = returnedStart;
                        moveForward = false;
                      }
                    }
                    if (moveForward && returnedLength && !earlierLog) {
                      $scope.log.start += returnedLength;
                      if (logLength && $scope.log.start > logLength) {
                        $scope.log.start = logLength;
                      }
                    }
                    updateJenkinsLink();
                  }
                  $scope.log.fetched = true;
                  Core.$apply($scope);
                  next();
                }).
                error(function (data, status, headers, config) {
                  log.warn("Failed to load " + url + " " + data + " " + status);
                });
            }
          } else {
            $scope.log.fetched = true;
            Core.$apply($scope);
            next();

          }
        });

        $scope.fetch();



        function replaceClusterIpFunction() {
          function createReplaceFunction(from, to) {
            return (text) => replaceText(text, from, to);
          }

          var replacements = [];
          angular.forEach($scope.model.services, (service) => {
            var $portalIP = service.$portalIP;
            var $serviceUrl = service.$serviceUrl;
            var $portsText = service.$portsText;
            if ($portalIP && $serviceUrl) {
              var idx = $serviceUrl.indexOf("://");
              if (idx > 0) {
                var replaceWith = $serviceUrl.substring(idx, $serviceUrl.length);
                if (!replaceWith.endsWith("/")) {
                  replaceWith += "/";
                }
                if (replaceWith.length > 4) {
                  replacements.push(createReplaceFunction(
                    "://" + $portalIP + "/",
                    replaceWith
                  ));
                  if ($portsText) {
                    var suffix = ":" + $portsText;
                    var serviceWithPort = replaceWith.substring(0, replaceWith.length - 1);
                    if (!serviceWithPort.endsWith(suffix)) {
                      serviceWithPort += suffix;
                    }
                    serviceWithPort += "/";
                    replacements.push(createReplaceFunction(
                      "://" + $portalIP + ":" + $portsText + "/",
                      serviceWithPort
                    ));
                  }
                }
              }
            }
          });

          return function(text) {
            var answer = text;
            angular.forEach(replacements, (fn) => {
              answer = fn(answer);
            });
            return answer;
          }
        }

        function replaceText(text, from, to) {
          if (from && to && text) {
            //log.info("Replacing '" + from + "' => '" + to + "'");
            var idx = 0;
            while (true) {
              idx = text.indexOf(from, idx);
              if (idx >= 0) {
                text = text.substring(0, idx) + to + text.substring(idx + from.length);
                idx += to.length;
              } else {
                break;
              }
            }
          }
          return text;
        }
      }]);
}