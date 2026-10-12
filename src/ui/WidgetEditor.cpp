#include "WidgetEditor.hpp"
#include "projects/WidgetProjectService.hpp"
#include <QFormLayout>
#include <QLineEdit>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QPlainTextEdit>
#include <QCheckBox>
#include <QDialogButtonBox>
#include <QComboBox>
#include <QLabel>
#include <QPushButton>
#include <QSplitter>
#include <QDesktopServices>
#include <QUrl>
#include <QFileInfo>
#include <QJsonDocument>
#include <QMessageBox>
#include <QTextDocument>
#include <QSignalBlocker>
#include <QInputDialog>
#include <QFileDialog>
namespace tt {
bool WidgetEditor::edit(WidgetConfig &w, QWidget *parent, WidgetProjectService *service)
{
	QDialog d(parent);
	d.setWindowTitle(QObject::tr("Widget project — save source, then publish"));
	d.resize(1000, 720);
	auto *root = new QVBoxLayout(&d);
	auto *split = new QSplitter;
	root->addWidget(split);
	auto *settingsPage = new QWidget;
	auto *form = new QFormLayout(settingsPage);
	split->addWidget(settingsPage);
	QJsonObject props;
	QString revision;
	if (service) {
		const auto m = service->get(w.id());
		revision = m["revision"].toString();
		const auto schema = service->projectPath(w.id()) + "/schema/settings.schema.json";
		if (QFileInfo::exists(schema))
			props = readObject(schema)["properties"].toObject();
	}
	if (props.isEmpty())
		for (auto it = w.value.begin(); it != w.value.end(); ++it) {
			if (it.key() == "id" || it.key() == "template" || it.key() == "customHtml" ||
			    it.key() == "editableHtml")
				continue;
			props[it.key()] = QJsonObject{{"type", it.value().isBool()     ? "boolean"
							       : it.value().isDouble() ? "integer"
							       : it.value().isArray()  ? "array"
										       : "string"}};
		}
	QMap<QString, QWidget *> fields;
	for (auto it = props.begin(); it != props.end(); ++it) {
		const auto key = it.key();
		const auto rule = it.value().toObject();
		const auto type = rule["type"].toString();
		QWidget *field = nullptr;
		if (type == "boolean") {
			auto *e = new QCheckBox;
			e->setChecked(w.value[key].toBool());
			field = e;
		} else if (type == "integer") {
			auto *e = new QSpinBox;
			e->setRange(rule["minimum"].toInt(0), rule["maximum"].toInt(8192));
			e->setValue(w.value[key].toInt(rule["default"].toInt()));
			field = e;
		} else if (type == "number") {
			auto *e = new QDoubleSpinBox;
			e->setDecimals(6);
			e->setRange(rule["minimum"].toDouble(-1e12), rule["maximum"].toDouble(1e12));
			e->setValue(w.value[key].toDouble(rule["default"].toDouble()));
			field = e;
		} else if (rule.contains("enum")) {
			auto *e = new QComboBox;
			for (const auto &v : rule["enum"].toArray())
				e->addItem(v.toVariant().toString(), v.toVariant());
			e->setCurrentIndex(e->findData(w.value[key].toVariant()));
			field = e;
		} else if (rule["x-ui"].toObject()["widget"] == "textarea") {
			auto *e = new QPlainTextEdit(w.value[key].toString());
			e->setMaximumHeight(100);
			field = e;
		} else {
			auto *e = new QLineEdit(
				type == "array"
					? QString::fromUtf8(
						  QJsonDocument(w.value[key].toArray()).toJson(QJsonDocument::Compact))
					: w.value[key].toString());
			field = e;
		}
		fields[key] = field;
		form->addRow(rule["title"].toString(key), field);
	}
	auto *diagnostic = new QLabel;
	diagnostic->setWordWrap(true);
	root->addWidget(diagnostic);
	auto values = [&] {
		auto value = w.value;
		for (auto it = fields.begin(); it != fields.end(); ++it) {
			auto *f = it.value();
			if (auto *e = qobject_cast<QCheckBox *>(f))
				value[it.key()] = e->isChecked();
			else if (auto *e = qobject_cast<QSpinBox *>(f))
				value[it.key()] = e->value();
			else if (auto *e = qobject_cast<QDoubleSpinBox *>(f))
				value[it.key()] = e->value();
			else if (auto *e = qobject_cast<QComboBox *>(f))
				value[it.key()] = QJsonValue::fromVariant(e->currentData());
			else if (auto *e = qobject_cast<QPlainTextEdit *>(f))
				value[it.key()] = e->toPlainText();
			else if (auto *e = qobject_cast<QLineEdit *>(f)) {
				if (props[it.key()].toObject()["type"] == "array") {
					QJsonParseError error;
					const auto doc = QJsonDocument::fromJson(e->text().toUtf8(), &error);
					if (error.error != QJsonParseError::NoError || !doc.isArray())
						throw DomainError("SETTINGS_INVALID",
								  "Expected JSON array for " + it.key());
					value[it.key()] = doc.array();
				} else
					value[it.key()] = e->text();
			}
		}
		return value;
	};
	auto guarded = [&](const std::function<void()> &fn) {
		try {
			fn();
		} catch (const std::exception &e) {
			diagnostic->setText(QString::fromUtf8(e.what()));
		}
	};
	if (service) {
		auto *sourcePage = new QWidget;
		auto *layout = new QVBoxLayout(sourcePage);
		split->addWidget(sourcePage);
		auto *path = new QLabel(service->projectPath(w.id()) + "/src");
		path->setWordWrap(true);
		layout->addWidget(path);
		auto *files = new QComboBox;
		for (const auto &file : service->files(w.id()))
			if (QStringList{"html", "htm", "css", "js", "mjs", "json", "txt", "svg"}.contains(
				    QFileInfo(file).suffix().toLower()))
				files->addItem(file);
		layout->addWidget(files);
		auto *code = new QPlainTextEdit;
		layout->addWidget(code, 1);
		auto load = [service, &w, files, code] {
			const auto selected = files->currentText();
			if (!selected.isEmpty())
				code->setPlainText(QString::fromUtf8(service->read(w.id(), selected)));
			code->document()->setModified(false);
			code->setProperty("loadedFile", selected);
		};
		load();
		QObject::connect(files, &QComboBox::currentTextChanged, &d, [&, files, code, load] {
			if (code->document()->isModified() &&
			    QMessageBox::question(&d, "Unsaved source", "Discard unsaved source edits?",
						  QMessageBox::Discard | QMessageBox::Cancel) != QMessageBox::Discard) {
				QSignalBlocker blocker(files);
				files->setCurrentText(code->property("loadedFile").toString());
				return;
			}
			guarded(load);
		});
		auto *saveSource = new QPushButton(QObject::tr("Save source"));
		layout->addWidget(saveSource);
		QObject::connect(saveSource, &QPushButton::clicked, &d, [&, files, code] {
			guarded([&] {
				const auto m = service->write(w.id(), files->currentText(),
							      code->toPlainText().toUtf8(), revision);
				revision = m["revision"].toString();
				code->document()->setModified(false);
				diagnostic->setText("Source saved; automatic publish follows when enabled.");
			});
		});

		auto refreshFiles = [service, &w, files, code, load] {
			QSignalBlocker blocker(files);
			files->clear();
			for (const auto &file : service->files(w.id()))
				if (QStringList{"html", "htm", "css", "js", "mjs", "json", "txt", "svg"}.contains(
					    QFileInfo(file).suffix().toLower()))
					files->addItem(file);
			load();
		};
		auto *manage = new QHBoxLayout;
		layout->addLayout(manage);
		for (const auto &operation : QStringList{"New file", "Rename", "Remove"}) {
			auto *button = new QPushButton(operation);
			manage->addWidget(button);
			QObject::connect(button, &QPushButton::clicked, &d, [&, operation, files, code, refreshFiles] {
				guarded([&] {
					if (code->document()->isModified())
						throw DomainError("UNSAVED_SOURCE",
								  "Save source before changing files");
					QString name;
					QJsonObject result;
					if (operation == "Remove") {
						if (QMessageBox::question(
							    &d, "Remove author file",
							    "Remove selected file? A history snapshot is retained.") !=
						    QMessageBox::Yes)
							return;
						result = service->fileOperation(w.id(), "remove", files->currentText(),
										{}, revision);
					} else {
						name = QInputDialog::getText(&d, operation,
									     "Project-relative path (src/...)",
									     QLineEdit::Normal, "src/");
						if (name.isEmpty())
							return;
						if (operation == "New file") {
							if (service->files(w.id()).contains(name))
								throw DomainError("FILE_EXISTS",
										  "Choose a new file name");
							result = service->write(w.id(), name, {}, revision);
						} else
							result = service->fileOperation(
								w.id(), "rename", files->currentText(), name, revision);
					}
					revision = result["revision"].toString();
					refreshFiles();
					if (!name.isEmpty())
						files->setCurrentText(name);
					diagnostic->setText("Author files updated; publication is separate.");
				});
			});
		}
		auto *importAsset = new QPushButton("Import asset…");
		layout->addWidget(importAsset);
		QObject::connect(importAsset, &QPushButton::clicked, &d, [&, refreshFiles] {
			guarded([&] {
				const auto external =
					QFileDialog::getOpenFileName(&d, "Import individual trusted resource");
				if (external.isEmpty())
					return;
				const auto name = QInputDialog::getText(&d, "Import asset",
									"Project-relative destination",
									QLineEdit::Normal,
									"assets/" + QFileInfo(external).fileName());
				if (name.isEmpty())
					return;
				const auto result = service->importAsset(w.id(), external, name, revision);
				revision = result["revision"].toString();
				refreshFiles();
			});
		});
		auto *exportProject = new QPushButton("Export source project…");
		layout->addWidget(exportProject);
		QObject::connect(exportProject, &QPushButton::clicked, &d, [&] {
			guarded([&] {
				const auto output = QFileDialog::getSaveFileName(&d, "Export project", {},
										 "TikTok widget (*.tiktokwidget)");
				if (!output.isEmpty()) {
					service->exportProject(w.id(), output);
					diagnostic->setText("Exported saved source/settings/assets");
				}
			});
		});
		auto *open = new QPushButton(QObject::tr("Open source folder"));
		layout->addWidget(open);
		QObject::connect(open, &QPushButton::clicked, &d, [&] {
			QDesktopServices::openUrl(QUrl::fromLocalFile(service->projectPath(w.id()) + "/src"));
		});
		auto *validate = new QPushButton(QObject::tr("Validate project"));
		layout->addWidget(validate);
		QObject::connect(validate, &QPushButton::clicked, &d, [&] {
			guarded([&] {
				diagnostic->setText(
					QString::fromUtf8(QJsonDocument(service->validate(w.id())).toJson()));
			});
		});
		auto *publish = new QPushButton(QObject::tr("Publish saved project"));
		layout->addWidget(publish);
		QObject::connect(publish, &QPushButton::clicked, &d, [&] {
			guarded([&] {
				const auto result = service->build(w.id(), revision, true);
				revision = service->get(w.id())["revision"].toString();
				diagnostic->setText("Published " + result["buildId"].toString());
			});
		});
		auto *preview = new QPushButton(QObject::tr("Preview published project"));
		layout->addWidget(preview);
		QObject::connect(preview, &QPushButton::clicked, &d, [&] {
			guarded([&] { QDesktopServices::openUrl(QUrl::fromLocalFile(service->preview(w.id()))); });
		});
		auto *declaredEvents = new QLineEdit(QString::fromUtf8(
			QJsonDocument(service->get(w.id())["events"].toArray()).toJson(QJsonDocument::Compact)));
		layout->addWidget(new QLabel("Declared event types (JSON array)"));
		layout->addWidget(declaredEvents);
		auto *saveProject = new QPushButton("Save event declarations");
		layout->addWidget(saveProject);
		QObject::connect(saveProject, &QPushButton::clicked, &d, [&, declaredEvents] {
			guarded([&] {
				const auto doc = QJsonDocument::fromJson(declaredEvents->text().toUtf8());
				if (!doc.isArray())
					throw DomainError("INVALID_PROJECT",
							  "Enter a JSON array of supported event names");
				const auto m = service->configure(w.id(), {{"events", doc.array()}}, revision);
				revision = m["revision"].toString();
				diagnostic->setText("Project event declarations saved");
			});
		});
		auto *setEntry = new QPushButton("Use selected HTML as entry");
		layout->addWidget(setEntry);
		QObject::connect(setEntry, &QPushButton::clicked, &d, [&, files] {
			guarded([&] {
				if (QFileInfo(files->currentText()).suffix().toLower() != "html")
					throw DomainError("MISSING_ENTRY", "Select an HTML file");
				const auto m = service->configure(w.id(), {{"entry", files->currentText()}}, revision);
				revision = m["revision"].toString();
				diagnostic->setText("Saved entry: " + files->currentText());
			});
		});
		auto *history = new QComboBox;
		for (const auto &r : service->history(w.id()))
			history->addItem(r.toObject()["revision"].toString());
		layout->addWidget(history);
		auto *rollback = new QPushButton(QObject::tr("Restore selected source revision"));
		layout->addWidget(rollback);
		QObject::connect(rollback, &QPushButton::clicked, &d, [&, history, load] {
			guarded([&] {
				const auto m = service->rollback(w.id(), history->currentText(), revision);
				revision = m["revision"].toString();
				load();
				diagnostic->setText("Source revision restored; publish to apply.");
			});
		});
	}
	QDialogButtonBox buttons(QDialogButtonBox::Save | QDialogButtonBox::Close);
	root->addWidget(&buttons);
	QObject::connect(&buttons, &QDialogButtonBox::accepted, &d, [&] {
		guarded([&] {
			auto result = values();
			if (service) {
				auto patch = result;
				for (const auto &key : {"id", "template", "customHtml", "editableHtml"})
					patch.remove(key);
				const auto m = service->settings(w.id(), patch, revision);
				revision = m["revision"].toString();
				result = m["settings"].toObject();
			}
			w.value = result;
			d.accept();
		});
	});
	QObject::connect(&buttons, &QDialogButtonBox::rejected, &d, &QDialog::reject);
	return d.exec() == QDialog::Accepted;
}
} // namespace tt
