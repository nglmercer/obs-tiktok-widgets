#include "WidgetGallery.hpp"
#include "projects/WidgetProjectService.hpp"
#include "widgets/WidgetRegistry.hpp"
#include <QDialog>
#include <QVBoxLayout>
#include <QLineEdit>
#include <QComboBox>
#include <QListWidget>
#include <QPushButton>
#include <QFileDialog>
#include <QLabel>
#include <QMessageBox>
#include <QIcon>
namespace tt {
QString WidgetGallery::choose(QWidget *p, WidgetProjectService *service)
{
	if (!service)
		return {};
	QString importedId;
	QDialog d(p);
	d.setWindowTitle("Template gallery");
	d.resize(650, 500);
	auto *l = new QVBoxLayout(&d);
	auto *search = new QLineEdit;
	search->setPlaceholderText("Search templates");
	l->addWidget(search);
	auto *categories = new QComboBox;
	categories->addItem("All categories", "");
	l->addWidget(categories);
	auto *list = new QListWidget;
	l->addWidget(list, 1);
	auto *details = new QLabel;
	details->setWordWrap(true);
	l->addWidget(details);
	auto populate = [&] {
		list->clear();
		const auto filter = search->text();
		for (const auto &v : service->templates.list()) {
			const auto m = v.toObject();
			if (!categories->currentData().toString().isEmpty() &&
			    m["category"] != categories->currentData())
				continue;
			const auto text =
				m["name"].toString() + " · " + m["id"].toString() + " @ " + m["version"].toString();
			if (!text.contains(filter, Qt::CaseInsensitive))
				continue;
			auto *item = new QListWidgetItem(text, list);
			item->setData(Qt::UserRole, m);
			if (m.contains("thumbnail")) {
				const auto definition =
					service->templates.resolve(m["id"].toString(), m["version"].toString());
				item->setIcon(QIcon(safePath(definition.root, m["thumbnail"].toString())));
				list->setIconSize(QSize(96, 64));
			}
			item->setToolTip(m["description"].toString());
		}
	};
	for (const auto &v : service->templates.list()) {
		const auto cat = v.toObject()["category"].toString();
		if (categories->findData(cat) < 0)
			categories->addItem(cat, cat);
	}
	populate();
	QObject::connect(search, &QLineEdit::textChanged, &d, [&] { populate(); });
	QObject::connect(categories, &QComboBox::currentIndexChanged, &d, [&] { populate(); });
	QObject::connect(list, &QListWidget::currentRowChanged, &d, [&] {
		if (list->currentItem())
			details->setText(
				list->currentItem()->data(Qt::UserRole).toJsonObject()["description"].toString() +
				"\nTrusted author code; creates an independent editable project.");
	});
	auto *install = new QPushButton("Install .tiktokwidget package…");
	l->addWidget(install);
	QObject::connect(install, &QPushButton::clicked, &d, [&] {
		const auto path =
			QFileDialog::getOpenFileName(&d, "Install template", {}, "TikTok widget (*.tiktokwidget)");
		if (path.isEmpty())
			return;
		try {
			TemplatePackageManager packages(service->directory(), service->templates);
			auto report = packages.install(path, true);
			if (QMessageBox::question(&d, "Trusted template",
						  "Install trusted code: " + report["name"].toString() + "?") ==
			    QMessageBox::Yes) {
				packages.install(path);
				populate();
			}
		} catch (const std::exception &e) {
			details->setText(QString::fromUtf8(e.what()));
		}
	});
	auto *importProject = new QPushButton("Import project package…");
	l->addWidget(importProject);
	QObject::connect(importProject, &QPushButton::clicked, &d, [&] {
		const auto file =
			QFileDialog::getOpenFileName(&d, "Import project", {}, "TikTok widget (*.tiktokwidget)");
		if (file.isEmpty())
			return;
		try {
			const auto report = service->importProject(file, true);
			details->setText("Project: " + report["settings"].toObject()["name"].toString() +
					 " (ID conflicts fork automatically)");
			if (QMessageBox::question(&d, "Import trusted project",
						  "Import this source/config/assets package?") == QMessageBox::Yes) {
				importedId = service->importProject(file)["id"].toString();
				d.accept();
			}
		} catch (const std::exception &e) {
			details->setText(QString::fromUtf8(e.what()));
		}
	});
	auto *exportTemplate = new QPushButton("Export selected template…");
	l->addWidget(exportTemplate);
	QObject::connect(exportTemplate, &QPushButton::clicked, &d, [&] {
		if (!list->currentItem())
			return;
		const auto out =
			QFileDialog::getSaveFileName(&d, "Export template", {}, "TikTok widget (*.tiktokwidget)");
		if (out.isEmpty())
			return;
		try {
			const auto m = list->currentItem()->data(Qt::UserRole).toJsonObject();
			TemplatePackageManager packages(service->directory(), service->templates);
			packages.exportPackage(service->templates.resolve(m["id"].toString(), m["version"].toString()),
					       out);
			details->setText("Exported template package");
		} catch (const std::exception &e) {
			details->setText(QString::fromUtf8(e.what()));
		}
	});
	auto *create = new QPushButton("Create editable project from selected template");
	l->addWidget(create);
	QObject::connect(create, &QPushButton::clicked, &d, [&] {
		if (list->currentItem())
			d.accept();
	});
	if (d.exec() != QDialog::Accepted)
		return {};
	if (!importedId.isEmpty())
		return "project:" + importedId;
	const auto selected = list->currentItem()->data(Qt::UserRole).toJsonObject();
	return "template:" + selected["id"].toString() + "@" + selected["version"].toString();
}
} // namespace tt
