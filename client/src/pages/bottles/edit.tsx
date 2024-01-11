import React, { useEffect, useState } from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber, Radio, Divider, Alert } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IResin } from "../resins/model";
import { ISpool } from "./model";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { useSpoolmanLocations } from "../../components/otherModels";
import { message } from "antd/lib";

export const SpoolEdit: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);

  const { form, formProps, saveButtonProps } = useForm<ISpool>({
    liveMode: "manual",
    onLiveEvent() {
      // Warn the user if the bottle has been updated since the form was opened
      messageApi.warning(t("bottle.form.bottle_updated"));
      setHasChanged(true);
    },
  });

  const { queryResult } = useSelect<IResin>({
    resource: "resin",
  });

  const resinOptions = queryResult.data?.data.map((item) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    let name = item.name;
    if (!name) {
      name = `ID: ${item.id}`;
    }
    let material = "";
    if (item.material) {
      material = ` - ${item.material}`;
    }
    const label = `${vendorPrefix}${name}${material}`;

    return {
      label: label,
      value: item.id,
      weight: item.weight,
      bottle_weight: item.bottle_weight,
    };
  });
  resinOptions?.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const [weightToEnter, setWeightToEnter] = useState(1);
  const [usedWeight, setUsedWeight] = useState(0);

  const selectedResinID = Form.useWatch("resin_id", form);
  const selectedResin = resinOptions?.find((obj) => {
    return obj.value === selectedResinID;
  });
  const resinWeight = selectedResin?.weight || 0;
  const bottleWeight = selectedResin?.bottle_weight || 0;

  const resinChange = (newID: number) => {
    const newSelectedResin = resinOptions?.find((obj) => {
      return obj.value === newID;
    });
    const newResinWeight = newSelectedResin?.weight || 0;
    const newSpoolWeight = newSelectedResin?.bottle_weight || 0;

    if (weightToEnter >= 3) {
      if (!(newResinWeight && newSpoolWeight)) {
        setWeightToEnter(2);
      }
    }
    if (weightToEnter >= 2) {
      if (!newResinWeight) {
        setWeightToEnter(1);
      }
    }
  };

  const weightChange = (weight: number) => {
    setUsedWeight(weight);
    form.setFieldValue("used_weight", weight);
  };

  const locations = useSpoolmanLocations(true);
  const [newLocation, setNewLocation] = useState("");

  const allLocations = [...(locations.data || [])];
  if (newLocation.trim() && !allLocations.includes(newLocation)) {
    allLocations.push(newLocation.trim());
  }

  if (formProps.initialValues) {
    formProps.initialValues["resin_id"] = formProps.initialValues["resin"].id;
  }

  useEffect(() => {
    if (formProps.initialValues) {
      setUsedWeight(formProps.initialValues["used_weight"]);
    }
  }, [formProps.initialValues]);

  return (
    <Edit saveButtonProps={saveButtonProps}>
      {contextHolder}
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("bottle.fields.id")}
          name={["id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input readOnly disabled />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.registered")}
          name={["registered"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker disabled showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.first_used")}
          name={["first_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.last_used")}
          name={["last_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.resin")}
          name={["resin_id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select
            options={resinOptions}
            showSearch
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
            onChange={(value) => {
              resinChange(value);
            }}
          />
        </Form.Item>
        <Form.Item hidden={true} name={["used_weight"]} initialValue={0}>
          <InputNumber value={usedWeight} />
        </Form.Item>
        <Form.Item label={t("bottle.fields.weight_to_use")} help={t("bottle.fields_help.weight_to_use")}>
          <Radio.Group
            onChange={(value) => {
              setWeightToEnter(value.target.value);
            }}
            defaultValue={1}
            value={weightToEnter}
          >
            <Radio.Button value={1}>{t("bottle.fields.used_weight")}</Radio.Button>
            <Radio.Button value={2} disabled={!resinWeight}>
              {t("bottle.fields.remaining_weight")}
            </Radio.Button>
            <Radio.Button value={3} disabled={!(resinWeight && bottleWeight)}>
              {t("bottle.fields.measured_weight")}
            </Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t("bottle.fields.used_weight")} help={t("bottle.fields_help.used_weight")}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 1}
            value={usedWeight}
            onChange={(value) => {
              weightChange(value ?? 0);
            }}
          />
        </Form.Item>
        <Form.Item label={t("bottle.fields.remaining_weight")} help={t("bottle.fields_help.remaining_weight")}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 2}
            value={resinWeight ? resinWeight - usedWeight : 0}
            onChange={(value) => {
              weightChange(resinWeight - (value ?? 0));
            }}
          />
        </Form.Item>
        <Form.Item label={t("bottle.fields.measured_weight")} help={t("bottle.fields_help.measured_weight")}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != 3}
            value={resinWeight && bottleWeight ? resinWeight - usedWeight + bottleWeight : 0}
            onChange={(value) => {
              weightChange(resinWeight - ((value ?? 0) - bottleWeight));
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.location")}
          help={t("bottle.fields_help.location")}
          name={["location"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Select
            dropdownRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Input
                  placeholder={t("bottle.form.new_location_prompt")}
                  value={newLocation}
                  onChange={(event) => setNewLocation(event.target.value)}
                />
              </>
            )}
            loading={locations.isLoading}
            options={allLocations.map((item) => ({ label: item, value: item }))}
          />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.lot_nr")}
          help={t("bottle.fields_help.lot_nr")}
          name={["lot_nr"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("bottle.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
      </Form>
      {hasChanged && <Alert description={t("bottle.form.bottle_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default SpoolEdit;
