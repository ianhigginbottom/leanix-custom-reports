import React, { Component } from 'react';
import CommonQueries from './common/CommonGraphQLQueries';
import DataIndex from './common/DataIndex';
import Utilities from './common/Utilities';
import Table from './Table';

const CATEGORY_EXCLUDE = 'service';

class Report extends Component {

	constructor(props) {
		super(props);
		this._initReport = this._initReport.bind(this);
		this._handleData = this._handleData.bind(this);
		this.CATEGORY_OPTIONS = {};
		// TODO: get Technopedia state from model as soon as it is available as attribute
		this.TECHNOP_STATE = {
			0: 'URL',
			1: 'Ignored',
			2: 'Missing',
			3: 'n/a'
		};
		this.state = {
			setup: null,
			data: []
		};
	}

	componentDidMount() {
		lx.init().then(this._initReport);
	}

	_initReport(setup) {
		lx.ready(this._createConfig());
		this.setState({
			setup: setup
		});
		// get options from data model
		const factsheetModel = setup.settings.dataModel.factSheets.ITComponent;
		this.CATEGORY_OPTIONS = Utilities.createOptionsObjFrom(
			factsheetModel, 'fields.category.values');
		// delete 'service'
		delete this.CATEGORY_OPTIONS[Utilities.getKeyToValue(this.CATEGORY_OPTIONS, CATEGORY_EXCLUDE)];
		// get all tags, then the data
		lx.executeGraphQL(CommonQueries.tagGroups).then((tagGroups) => {
			const index = new DataIndex();
			index.put(tagGroups);
			const applicationTagId = index.getFirstTagID('Application Type', 'Application');
			lx.executeGraphQL(this._createQuery(applicationTagId)).then((data) => {
				index.put(data);
				this._handleData(index, applicationTagId);
			});
		});
	}

	_createConfig() {
		return {
			allowEditing: false
		};
	}

	_createQuery(applicationTagId) {
		let applicationTagIdFilter = ''; // initial assume tagGroup.name changed or the id couldn't be determined otherwise
		let tagNameDef = 'tags { name }'; // initial assume to get it
		if (applicationTagId) {
			applicationTagIdFilter = `, {facetKey: "BC Type", keys: ["${applicationTagId}"]}`;
			tagNameDef = '';
		}
		return `{applications: allFactSheets(
					sort: {mode: BY_FIELD, key: "displayName", order: asc},
					filter: { facetFilters: [
						{facetKey: "FactSheetTypes", keys: ["Application"]}
						${applicationTagIdFilter}
					]}
				) {
					edges { node {
						id name ${tagNameDef}
						... on Application {
							relApplicationToITComponent {
								edges { node { factSheet {
									id name type
									documents {
										edges { node { name url } }
									}
									... on ITComponent {
										category
										relITComponentToApplication {
											edges { node { factSheet { name } } }
										}
 									}
								}}}
							}
						}
					}}
				}}`;
	}

	_handleData(index, applicationTagId) {
		const tableData = [];
		let tmpDocChoice = 0; // for doc test only
		index.applications.nodes.forEach((app) => {
			if (!applicationTagId && !index.includesTag(app, 'Application')) {
				return;
			}
			const subIndex = app.relApplicationToITComponent;
			if (!subIndex) {
				return;
			}
			subIndex.nodes.forEach((itcmp) => {
				if (itcmp.category === CATEGORY_EXCLUDE) {
					return;
				}
				/* excluded in cause of 'for doc test only'
				 * const documents = itcmp.documents ? itcmp.documents.nodes : [];
				 */
				const documents = this._getDocuments(tmpDocChoice);  // for doc test only
				if (tmpDocChoice > 5) {tmpDocChoice = 0} else {tmpDocChoice++};  // for doc test only
				const doc = { state: 3, ref: '' };
				documents.forEach((e) => {
					/* TODO:
						use attribute for state as soon as it is available
						instead of parsing document name
					*/
					if (!e.name.startsWith('Technopedia entry')) {
						return;
					}
					if (e.name.endsWith('ignored')) {
						doc.state = 1;
					} else if (e.name.endsWith('missing')) {
						doc.state = 2;
					} else {
						doc.state = 0;
						doc.ref = e.url ? e.url : '';
					}
				});
				tableData.push({
					id: app.id + '-' + itcmp.id,
					appName: app.name,
					appId: app.id,
					itcmpName: itcmp.name,
					itcmpId: itcmp.id,
					itcmpCategory: this._getOptionKeyFromValue(this.CATEGORY_OPTIONS, itcmp.category),
					state: doc.state,
					stateRef: doc.ref,
					count: this._getCountInOtherMarkets(itcmp, Utilities.getMarket(app))
				});
			});
		});
		this.setState({
			data: tableData
		});
	}

	_getCountInOtherMarkets(itcmp, market) {
		if (!itcmp || !itcmp.relITComponentToApplication || !market) {
			return 0;
		}
		let count = 0;
		itcmp.relITComponentToApplication.nodes.forEach((app) => {
			const appmarket = Utilities.getMarket(app);
			if (appmarket && appmarket !== market) {
				count++;
			}
		});
		return count;
	}

	_getOptionKeyFromValue(options, value) {
		if (!value) {
			return undefined;
		}
		const key = Utilities.getKeyToValue(options, value);
		return key !== undefined && key !== null ? parseInt(key, 10) : undefined;
	}

	/* a workaround for doc testing only because 'allFactSheets' don't deliver documents */
	_getDocuments(what) {
		const nodes = [];
		switch (what) {
			case 0:
				// TDBF
				nodes.push({
					name: 'Technopedia entry',
					url: 'http://technopedia.com/release/67015598'
				});
				break;
			case 1:
				// ignore
				nodes.push({
					name: 'Technopedia entry - ignored',
					url: 'http://www.technopedia.com'
				});
				break;
			case 2:
				// miss
				nodes.push({
					name: 'Technopedia entry - missing',
					url: 'http://www.technopedia.com'
				});
				break;
			case 3:
				// TDMaker
				nodes.push({
					name: 'Technopedia entry',
					url: 'http://technopedia.com/release/74423149'
				});
				// add other
				nodes.push({
					name: 'other',
					url: 'https://heise.de'
				});
				break;
		}
		return nodes;
	}

	render() {
		return (
			<Table data={this.state.data}
				options={{
					category: this.CATEGORY_OPTIONS,
					technopState: this.TECHNOP_STATE
				}}
				setup={this.state.setup} />
		);
	}
}

export default Report;
