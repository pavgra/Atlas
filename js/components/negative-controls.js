define(['knockout',
	'text!./negative-controls.html',
	'appConfig',
	'webapi/EvidenceAPI',
	'webapi/CDMResultsAPI',
	'webapi/ConceptSetAPI',
	'atlas-state',
	'ohdsi.util',
	'knockout.dataTables.binding',
	'databindings'
], function (ko, view, config, evidenceAPI, cdmResultsAPI, conceptSetAPI, sharedState) {
	function negativeControls(params) {
		var self = this;

		var pollTimeout = null;
		self.model = params.model;
		self.selectedConcepts = params.selectedConcepts;
		self.conceptSet = params.conceptSet;
		self.conceptIds = params.conceptIds;
		self.defaultResultsUrl = params.defaultResultsUrl;
		self.negativeControls = params.negativeControls;
		self.dirtyFlag = params.dirtyFlag;
		self.saveConceptSet = params.saveConceptSet;
		self.conceptSetValid = ko.observable(false);
		self.conceptSetValidText = ko.observable("");
		self.conceptDomainId = ko.observable(null);
		self.targetDomainId = ko.observable(null);
		self.currentEvidenceService = ko.observable();
		self.currentResultSource = ko.observable();
		self.loadingResults = ko.observable(false);
		self.evidenceSources = ko.observableArray();
		self.loadingEvidenceSources = ko.observable(false);
		self.selectedReportCaption = ko.observable();
		self.recordCountsRefreshing = ko.observable(false);
		self.recordCountClass = ko.pureComputed(function () {
			return self.recordCountsRefreshing() ? "fa fa-circle-o-notch fa-spin fa-lg" : "fa fa-database fa-lg";
		});
		self.newConceptSetName = ko.observable(self.conceptSet()
			.name() + " - Candidate Controls");

		self.negControlColumns = [{
				title: 'Id',
				data: d => d.conceptId,
			},
			{
				title: 'Name',
				data: d => {
					var valid = true; //d.INVALID_REASON_CAPTION == 'Invalid' ? 'invalid' : '';
					return '<a class=' + valid + ' href=\'#/concept/' + d.conceptId + '\'>' + d.conceptName + '</a>';
				},
			},
			{
				title: 'Domain',
				data: d => d.domainId,
				visible: false,
			},
			{
				title: 'Suggested Negative Control',
				data: d => {
					return d.negativeControl.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'Person Count RC',
				data: d => {
					return d.personCountRc.toString()
						.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
				},
			},
			{
				title: 'Person Count DC',
				data: d => {
					return d.personCountDc.toString()
						.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
				},
			},
			{
				title: 'Publication Count (Descendant Concept Match)',
				data: d => {
					return d.descendantPmidCount.toString()
						.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
				},
			},
			{
				title: 'Publication Count (Exact Concept Match)',
				data: d => {
					return d.exactPmidCount.toString()
						.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
				},
			},
			{
				title: 'Publication Count (Parent Concept Match)',
				data: d => {
					return d.parentPmidCount.toString()
						.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
				},
			},
			{
				title: 'Publication Count (Ancestor Concept Match)',
				data: d => {
					return d.ancestorPmidCount.toString()
						.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
				},
			},
			{
				title: 'Broad Concept',
				data: d => {
					return d.tooBroad.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'Pregnancy Concept',
				data: d => {
					return d.pregnancy.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'Drug Induced Concept',
				data: d => {
					return d.drugInduced.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'Drug Indicated for Condition',
				data: d => {
					return d.indication.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'Found on Product Label',
				data: d => {
					return d.splicer.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'Signal in FAERS',
				data: d => {
					return d.faers.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'User Excluded',
				data: d => {
					return d.userExcluded.toString() == "1" ? 'Y' : 'N';
				},
			},
			{
				title: 'User Included',
				data: d => {
					return d.userIncluded.toString() == "1" ? 'Y' : 'N';
				},
			},
		];

		self.negControlOptions = {
			lengthMenu: [
				[10, 25, 50, 100, -1],
				['10', '25', '50', '100', 'All']
			],
			order: [
				[4, 'asc'],
				[5, 'desc']
			],
			Facets: [{
					'caption': 'Suggested Negative Control',
					'binding': d => {
						return d.negativeControl.toString() == "1" ? 'Yes' : 'No';
					},
				},
				{
					'caption': 'Publication Count (Exact Concept Match)',
					'binding': d => {
						var val = d.exactPmidCount;
						if (val.replace)
							val = parseInt(val.replace(/\,/g, '')); // Remove comma formatting and treat as int
						if (val > 0) {
							return '> 0'
						} else {
							return '<= 0'
						}
					},
				},
				{
					'caption': 'Found on Product Label',
					'binding': d => {
						var val = d.splicer;
						if (val.replace)
							val = parseInt(val.replace(/\,/g, '')); // Remove comma formatting and treat as int
						if (val > 0) {
							return 'Yes'
						} else {
							return 'No'
						}
					},
				},
				{
					'caption': 'Signal in FAERS',
					'binding': d => {
						var val = d.faers;
						if (val.replace)
							val = parseInt(val.replace(/\,/g, '')); // Remove comma formatting and treat as int
						if (val > 0) {
							return 'Yes'
						} else {
							return 'No'
						}
					},
				},
			]
		};

		self.selectedConceptsSubscription = self.selectedConcepts.subscribe(function (newValue) {
			if (newValue != null) {
				self.evaluateConceptSet();
			}
		});

		self.isRunning = ko.pureComputed(function () {
			return self.evidenceSources()
				.filter(function (info) {
					return !(info.status() == "COMPLETE" || info.status() == "n/a");
				})
				.length > 0;
		});

		self.getSourceInfo = function (sourceKey) {
			return self.evidenceSources()
				.filter(function (d) {
					return d.sourceKey() == sourceKey
				})[0];
		}

		self.canGenerate = ko.pureComputed(function () {
			var isDirty = self.dirtyFlag() && self.dirtyFlag()
				.isDirty();
			var isNew = self.model.currentConceptSet() && (self.model.currentConceptSet()
				.id == 0);
			var canGenerate = !(isDirty || isNew);
			return (canGenerate);
		});

		self.pollForInfo = function () {
			if (pollTimeout)
				clearTimeout(pollTimeout);

			var id = self.conceptSet()
				.id;
			conceptSetAPI.getGenerationInfo(id)
				.then(function (infoList) {
					var hasPending = false;
					console.log("poll for evidence....")

					infoList.forEach(function (info) {
						// obtain source reference
						var source = self.evidenceSources()
							.filter(function (s) {
								return s.sourceId() == info.sourceId
							})[0];

						if (source) {
							// only bother updating those sources that we know are running
							if (self.isSourceRunning(source)) {
								source.status(info.status);
								source.isValid(info.isValid);
								var date = new Date(info.startTime);
								source.startTime(date.toLocaleDateString() + ' ' + date.toLocaleTimeString());
								source.executionDuration('...');

								if (info.status != "COMPLETE") {
									hasPending = true;
								} else {
									source.executionDuration((info.executionDuration / 1000) + 's');
								}
							}
						}
					});

					if (hasPending) {
						pollTimeout = setTimeout(function () {
							self.pollForInfo();
						}, 5000);
					}
				});
		}

		self.generate = function (service, event) {
			// Check to make sure the concept set is valid before calling the service
			if (!self.conceptSetValid()) {
				alert("The concept set is not marked as valid to generate results. Please make sure this concept set contains only CONDITIONS or DRUGS.");
				return;
			}

			// Call the ajax service to generate the results
			var negativeControlsJob = evidenceAPI.generateNegativeControls(service.sourceKey(), self.conceptSet()
				.id, self.conceptSet()
				.name(), self.conceptDomainId(), self.targetDomainId(), self.conceptIds(), service.conceptsToInclude(), service.conceptsToExclude());

			// Mark as pending results
			self.getSourceInfo(service.sourceKey())
				.status('PENDING');

			// Kick the job off
			$.when(negativeControlsJob)
				.done(function (jobInfo) {
					pollTimeout = setTimeout(function () {
						self.pollForInfo();
					}, 3000);
				});
		}

		self.isGenerating = function () {
			return false;
		}

		self.evaluateConceptSet = function () {
			// Determine if all of the concepts in the current concept set
			// are all of the same type (CONDITION or DRUG) and if so, this
			// concept set is valid and can be evaluated for negative controls
			var conceptSetValid = false;
			var conceptDomainId = null;
			var targetDomainId = null;
			var conceptSetLength = self.selectedConcepts()
				.length;
			var conditionLength = self.selectedConcepts()
				.filter(function (elem) {
					return elem.concept.DOMAIN_ID == "Condition";
				})
				.length;
			var drugLength = self.selectedConcepts()
				.filter(function (elem) {
					return elem.concept.DOMAIN_ID == "Drug";
				})
				.length;

			if (conceptSetLength > 0) {
				if (conditionLength == conceptSetLength) {
					conceptSetValid = true;
					conceptDomainId = "Condition";
					targetDomainId = "Drug";
				} else if (drugLength == conceptSetLength) {
					conceptSetValid = true;
					conceptDomainId = "Drug";
					targetDomainId = "Condition";
				} else {
					self.conceptSetValidText("Your saved concepts come from multiple Domains (Condition, Drug). The concept set must contain ONLY conditions OR drugs in order to explore evidence.");
				}
			} else {
				self.conceptSetValidText("You must define a concept set with drugs found in the RxNorm vocbulary at the Ingredient class level OR Conditions from SNOMED. The concept set must contain ONLY conditions OR drugs in order to explore evidence.");
			}
			self.conceptSetValid(conceptSetValid);
			self.conceptDomainId(conceptDomainId);
			self.targetDomainId(targetDomainId);
		}

		self.getEvidenceSourcesFromConfig = function () {
			evidenceSources = [];

			$.each(config.api.sources, function (i, source) {
				if (source.hasEvidence) {
					var sourceInfo = {};
					sourceInfo.sourceId = ko.observable(source.sourceId);
					sourceInfo.sourceKey = ko.observable(source.sourceKey);
					sourceInfo.sourceName = ko.observable(source.sourceName);
					sourceInfo.startTime = ko.observable("n/a");
					sourceInfo.executionDuration = ko.observable("n/a");
					sourceInfo.status = ko.observable("n/a");
					sourceInfo.isValid = ko.observable(false);

					evidenceSources.push(sourceInfo);
				}
			});

			return evidenceSources;
		}

		self.getEvidenceSources = function () {
			self.loadingEvidenceSources(true);
			var resolvingPromise = conceptSetAPI.getGenerationInfo(self.conceptSet()
				.id);
			$.when(resolvingPromise)
				.done(function (generationInfo) {
					var evidenceSources = self.getEvidenceSourcesFromConfig();
					$.each(evidenceSources, function (i, evidenceSource) {
						var gi = $.grep(generationInfo, function (a) {
							return a.sourceId == evidenceSource.sourceId();
						});
						if (gi.length > 0) {
							var date = new Date(gi[0].startTime);
							var execDuration = (gi[0].executionDuration / 1000) + 's'
							evidenceSources[i].startTime(date.toLocaleDateString() + ' ' + date.toLocaleTimeString());
							evidenceSources[i].executionDuration(execDuration);
							evidenceSources[i].status(gi[0].status);
							evidenceSources[i].isValid(gi[0].isValid);
							var giParams = JSON.parse(gi[i].params);
							evidenceSources[i].conceptsToInclude = ko.observable(giParams.conceptsToInclude);
							evidenceSources[i].conceptsToExclude = ko.observable(giParams.conceptsToExclude);

							if (gi[0].status == "RUNNING") {
								self.pollForInfo();
							}
						}
					});
					self.evidenceSources(evidenceSources);
					self.loadingEvidenceSources(false);
				});
		};

		self.resultSources = ko.computed(function () {
			var resultSources = [];
			$.each(config.api.sources, function (i, source) {
				if (source.hasResults) {
					resultSources.push(source);
					if (source.resultsUrl == sharedState.resultsUrl()) {
						self.currentResultSource(source);
					}
				}
			});


			return resultSources;
		}, this);

		self.refreshRecordCounts = function (obj, event) {
			if (event.originalEvent) {
				// User changed event
				console.log("Record count refresh");
				self.recordCountsRefreshing(true);
				$("#dtNegCtrlRC")
					.toggleClass("fa-database")
					.toggleClass("fa-circle-o-notch")
					.toggleClass("fa-spin");
				$("#dtNegCtrlDRC")
					.toggleClass("fa-database")
					.toggleClass("fa-circle-o-notch")
					.toggleClass("fa-spin");
				var negativeControls = self.negativeControls();
				var conceptIdsForNegativeControls = $.map(negativeControls, function (o, n) {
					return o.conceptId;
				});
				cdmResultsAPI.getConceptRecordCount(self.currentResultSource()
						.sourceKey, conceptIdsForNegativeControls, negativeControls)
					.then(function (rowcounts) {
						self.negativeControls(negativeControls);
						console.log('record counts different?');
						self.recordCountsRefreshing(false);
						$("#dtNegCtrlRC")
							.toggleClass("fa-database")
							.toggleClass("fa-circle-o-notch")
							.toggleClass("fa-spin");
						$("#dtNegCtrlDRC")
							.toggleClass("fa-database")
							.toggleClass("fa-circle-o-notch")
							.toggleClass("fa-spin");
					});
			}
		}

		self.loadResults = function (service) {
			self.loadingResults(true);
			self.currentEvidenceService(service);
			self.selectedReportCaption(service.name);
			evidenceAPI.getNegativeControls(service.sourceKey(), self.conceptSet()
					.id)
				.then(function (results) {
					console.log("Get negative controls");
					var conceptIdsForNegativeControls = $.map(results, function (o, n) {
						return o.conceptId;
					});
					cdmResultsAPI.getConceptRecordCount(self.currentResultSource()
							.sourceKey, conceptIdsForNegativeControls, results)
						.then(function (rowcounts) {
							self.negativeControls(results);
							self.loadingResults(false);
						});
				});
		}

		self.isSourceRunning = function (source) {
			if (source) {
				switch (source.status()) {
				case 'COMPLETE':
					return false;
					break;
				case 'ERROR':
					return false;
					break;
				case 'n/a':
					return false;
					break;
				default:
					return true;
				}
			} else {
				return false;
			}
		}

		self.showNegControlsSaveNewModal = function () {
			$('negative-controls #modalNegControlsSaveNew')
				.modal('show');
		}

		self.saveNewConceptSet = function () {
			var dtItems = $('#negControlResults table')
				.DataTable()
				.data();
			var conceptSet = {};
			conceptSet.id = 0;
			conceptSet.name = self.newConceptSetName;
			var selectedConcepts = [];
			_.each(dtItems, (item) => {
				var concept;
				concept = {
					CONCEPT_CLASS_ID: item.conceptClassId,
					CONCEPT_CODE: item.conceptCode,
					CONCEPT_ID: item.conceptId,
					CONCEPT_NAME: item.conceptName,
					DOMAIN_ID: item.domainId,
					INVALID_REASON: null,
					INVALID_REASON_CAPTION: null,
					STANDARD_CONCEPT: null,
					STANDARD_CONCEPT_CAPTION: null,
					VOCABULARY_ID: null,
				}
				var newItem;
				newItem = {
					concept: concept,
					isExcluded: ko.observable(false),
					includeDescendants: ko.observable(false),
					includeMapped: ko.observable(false),
				}
				selectedConcepts.push(newItem);
			})
			self.saveConceptSet("#txtNewConceptSetName", conceptSet, selectedConcepts);
			$('conceptset-manager #modalSaveNew')
				.modal('hide');
		}

		// Evalute the concept set when this component is loaded
		self.evaluateConceptSet();

		// Get the evidence sources
		self.getEvidenceSources();
	}

	var component = {
		viewModel: negativeControls,
		template: view
	};

	ko.components.register('negative-controls', component);
	return component;
});
